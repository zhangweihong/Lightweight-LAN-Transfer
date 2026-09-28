"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { HttpError } = require("./errors");
const { Store } = require("./store");
const { acceptUpgrade, encodeFrame } = require("./ws");
const QRCode = require("qrcode");

const COOKIE = "lft_session";
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const STATIC_FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
  "/favicon.svg": { file: "favicon.svg", type: "image/svg+xml" },
  "/keepawake.mp4": { file: "keepawake.mp4", type: "video/mp4" },
  "/keepawake.webm": { file: "keepawake.webm", type: "video/webm" },
  "/qrcode.min.js": { file: "qrcode.min.js", type: "text/javascript; charset=utf-8" },
};

// 在线设备和传输事件都从这里推给浏览器。
class Hub {
  constructor() {
    this.clients = new Map();
    this.timer = setInterval(() => this.ping(), 25000);
    if (this.timer.unref) this.timer.unref();
  }

  add(client) {
    if (!this.clients.has(client.deviceId)) this.clients.set(client.deviceId, new Set());
    this.clients.get(client.deviceId).add(client);
    this.broadcastPeers();
  }

  remove(client) {
    const set = this.clients.get(client.deviceId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) this.clients.delete(client.deviceId);
    this.broadcastPeers();
  }

  online() {
    const peers = [];
    for (const [id, set] of this.clients) {
      if (set.size === 0) continue;
      const client = set.values().next().value;
      peers.push({ id, name: client.name });
    }
    peers.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return peers;
  }

  sendTo(deviceId, message) {
    const set = this.clients.get(deviceId);
    if (!set) return;
    for (const client of set) client.send(message);
  }

  broadcast(message) {
    for (const set of this.clients.values()) {
      for (const client of set) client.send(message);
    }
  }

  broadcastPeers() {
    this.broadcast({ type: "peers", peers: this.online() });
  }

  notify(transfer, event) {
    const message = { type: "transfer", event, transfer };
    this.sendTo(transfer.senderId, message);
    if (transfer.receiverId !== transfer.senderId) this.sendTo(transfer.receiverId, message);
  }

  notifyDelete(id, senderId, receiverId) {
    const message = { type: "transfer:delete", id };
    if (senderId) this.sendTo(senderId, message);
    if (receiverId && receiverId !== senderId) this.sendTo(receiverId, message);
  }

  rename(deviceId, name) {
    const set = this.clients.get(deviceId);
    if (!set) return;
    for (const client of set) client.name = name;
    this.broadcastPeers();
  }

  ping() {
    for (const set of this.clients.values()) {
      for (const client of set) client.ping();
    }
  }

  close() {
    clearInterval(this.timer);
  }
}

// 一条浏览器 WebSocket 连接。
class SocketClient {
  constructor(socket, device) {
    this.socket = socket;
    this.deviceId = device.id;
    this.name = device.name;
    this.missed = 0;
  }

  send(message) {
    if (this.socket.destroyed) return;
    this.socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(message))));
  }

  ping() {
    if (this.socket.destroyed) return;
    this.missed += 1;
    if (this.missed > 2) {
      this.socket.destroy();
      return;
    }
    this.socket.write(encodeFrame(0x9, Buffer.alloc(0)));
  }
}

// 收集本机局域网 IPv4，方便手机直接打开。
function lanUrls(port) {
  const urls = [];
  const nets = os.networkInterfaces();
  for (const [name, list] of Object.entries(nets)) {
    if (isVirtualAdapter(name)) continue;
    for (const item of list || []) {
      if (item.internal) continue;
      if (item.family !== "IPv4" && item.family !== 4) continue;
      if (isVirtualAddress(item.address)) continue;
      urls.push("http://" + item.address + ":" + port);
    }
  }
  return urls;
}

// 跳过虚拟网卡和常见代理 TUN，避免把手机带到错误地址。
function isVirtualAdapter(name) {
  return /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|loopback|bluetooth|mihomo|clash|tun|tap|sing-?box|npcap|radmin|hamachi|virtual/i.test(name);
}

function isVirtualAddress(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19;
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, "too_large", "请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req, 1024 * 1024);
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw new HttpError(400, "bad_json", "请求不是有效的 JSON");
  }
}

function sendJson(res, status, payload, extraHeaders) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(extraHeaders || {}),
  });
  res.end(body);
}

function sessionCookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}

function authenticate(req, store) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token = bearer || parseCookies(req)[COOKIE] || "";
  const device = store.deviceByToken(token);
  if (!device) throw new HttpError(401, "unauthorized", "设备身份已失效，请刷新页面");
  return device;
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let host = "";
  try {
    host = new URL(origin).host;
  } catch (error) {
    throw new HttpError(403, "bad_origin", "来源无效");
  }
  if (host !== req.headers.host) throw new HttpError(403, "bad_origin", "拒绝跨站请求");
}

function contentDisposition(name) {
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function parseContentRange(header, size) {
  const matched = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(header || "").trim());
  if (!matched) throw new HttpError(400, "bad_range", "缺少有效的 Content-Range");
  const start = Number(matched[1]);
  const endInclusive = Number(matched[2]);
  const total = Number(matched[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endInclusive) || total !== size) {
    throw new HttpError(400, "bad_range", "Content-Range 无效");
  }
  if (endInclusive < start || endInclusive >= size) {
    throw new HttpError(400, "bad_range", "分片超出文件范围");
  }
  return { start, end: endInclusive + 1 };
}


function readChunkRange(req, size) {
  const startHeader = req.headers["x-chunk-start"];
  const endHeader = req.headers["x-chunk-end"];
  if (startHeader != null && endHeader != null) {
    const start = Number(startHeader);
    const end = Number(endHeader);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end > size) {
      throw new HttpError(400, "bad_range", "分片范围无效");
    }
    return { start, end };
  }
  return parseContentRange(req.headers["content-range"], size);
}
function parseByteRange(header, size) {
  if (!header) return { start: 0, end: Math.max(0, size - 1), partial: false };
  const matched = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!matched || (matched[1] === "" && matched[2] === "")) {
    throw new HttpError(416, "bad_range", "Range 无效");
  }
  let start = 0;
  let end = size - 1;
  if (matched[1] === "") {
    const suffix = Number(matched[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new HttpError(416, "bad_range", "Range 无效");
    start = Math.max(0, size - suffix);
  } else {
    start = Number(matched[1]);
    end = matched[2] === "" ? size - 1 : Number(matched[2]);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    throw new HttpError(416, "bad_range", "Range 超出文件");
  }
  return { start, end: Math.min(end, size - 1), partial: true };
}

// 支持 Range，接收方中断后可以从字节偏移继续。
function sendFileRange(req, res, filePath, size, fileName, etag) {
  if (size === 0) {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": 0,
      "Accept-Ranges": "bytes",
      "Content-Disposition": contentDisposition(fileName),
      "Cache-Control": "no-store",
      ...(etag ? { ETag: '"' + etag + '"' } : {}),
    });
    res.end();
    return;
  }
  const range = parseByteRange(req.headers.range, size);
  const length = range.end - range.start + 1;
  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Length": length,
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(fileName),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(etag ? { ETag: '"' + etag + '"' } : {}),
  };
  if (range.partial) {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
    res.writeHead(206, headers);
  } else {
    res.writeHead(200, headers);
  }
  const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(500);
    res.destroy();
  });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

function sendStatic(req, res, urlPath) {
  const item = STATIC_FILES[urlPath];
  if (!item) return false;
  const filePath = path.join(PUBLIC_DIR, item.file);
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  const size = stat.size;
  if (req && req.headers && req.headers.range) {
    const range = parseByteRange(req.headers.range, size);
    const length = range.end - range.start + 1;
    res.writeHead(range.partial ? 206 : 200, {
      "Content-Type": item.type,
      "Content-Length": length,
      "Accept-Ranges": "bytes",
      ...(range.partial ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` } : {}),
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    return true;
  }
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": item.type,
    "Content-Length": body.length,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
  return true;
}

// 创建 HTTP + WebSocket 服务。测试和正式启动共用这一份。
async function createApp(options = {}) {
  const store = new Store(options);
  await store.init();
  const hub = new Hub();
  const server = http.createServer((req, res) => {
    handleRequest(req, res, { store, hub, server }).catch((error) => {
      const status = error.status || 500;
      if (status >= 500) console.error(error);
      if (res.headersSent || res.writableEnded) {
        res.destroy();
        return;
      }
      sendJson(res, status, {
        error: error.code || "error",
        message: status >= 500 ? "服务器内部错误" : error.message,
      });
    });
  });
  server.on("upgrade", (req, socket, head) => {
    handleUpgrade(req, socket, head, store, hub).catch((error) => {
      socket.destroy();
      if (!error || error.code !== "ENOENT") console.error(error);
    });
  });
  const cleaner = setInterval(() => {
    store.cleanup()
      .then((expired) => {
        for (const transfer of expired) hub.notify(transfer, "expired");
      })
      .catch((error) => console.error("清理过期传输失败", error));
  }, options.cleanupIntervalMs || 60 * 1000);
  if (cleaner.unref) cleaner.unref();
  server.on("close", () => {
    clearInterval(cleaner);
    hub.close();
  });
  server.requestTimeout = 0;
  server.store = store;
  server.hub = hub;
  return server;
}

async function handleUpgrade(req, socket, head, store, hub) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const device = store.deviceByToken(parseCookies(req)[COOKIE] || "");
  if (!device) {
    const message = "unauthorized";
    socket.write(`HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: ${message.length}\r\n\r\n${message}`);
    socket.destroy();
    return;
  }
  const client = new SocketClient(socket, device);
  const upgraded = acceptUpgrade(req, socket, head, {
    onText() {},
    onPing(payload) {
      if (!socket.destroyed) socket.write(encodeFrame(0xA, payload));
    },
    onPong() {
      client.missed = 0;
    },
    onClose() {
      if (!socket.destroyed) socket.end(encodeFrame(0x8, Buffer.alloc(0)));
    },
  });
  if (!upgraded) return;
  socket.on("end", () => {
    if (!socket.destroyed) socket.end();
  });
  socket.on("close", () => hub.remove(client));
  socket.on("error", () => socket.destroy());
  hub.add(client);
  client.send({ type: "hello", me: { id: device.id, name: device.name }, peers: hub.online() });
  await store.touch(device.id);
}

async function handleRequest(req, res, ctx) {
  const url = new URL(req.url, "http://localhost");
  const { store, hub, server } = ctx;
  if (req.method === "GET" && sendStatic(req, res, url.pathname)) return;
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/info") {
    const address = server.address();
    const port = address ? address.port : 0;
    sendJson(res, 200, {
      port,
      urls: [`http://127.0.0.1:${port}`, ...lanUrls(port)],
      chunkSize: store.chunkSize,
      maxFileSize: store.maxFileSize,
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/qrcode") {
    const text = url.searchParams.get("text") || "";
    if (!text) throw new HttpError(400, "text_required", "text parameter is required");
    const svg = await QRCode.toString(text, {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: "M",
    });
    sendJson(res, 200, { svg });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/session") {
    assertSameOrigin(req);
    const body = await readJson(req);
    const opened = await store.openSession({
      deviceId: body.deviceId,
      token: body.token || parseCookies(req)[COOKIE] || "",
      name: body.name,
    });
    sendJson(res, 200, { device: opened.device, token: opened.token }, { "Set-Cookie": sessionCookie(opened.token) });
    return;
  }

  const unsafe = req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE";
  if (unsafe) assertSameOrigin(req);
  const device = authenticate(req, store);

  if (req.method === "PATCH" && url.pathname === "/api/session") {
    const body = await readJson(req);
    const updated = await store.rename(device.id, body.name);
    hub.rename(device.id, updated.name);
    sendJson(res, 200, { device: updated });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/peers") {
    const peers = hub.online().map((peer) => ({ ...peer, self: peer.id === device.id }));
    sendJson(res, 200, { peers });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/transfers") {
    sendJson(res, 200, { transfers: store.listFor(device.id) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/transfers") {
    const body = await readJson(req);
    const transfers = await store.createTransfers(device.id, body);
    for (const transfer of transfers) {
      const event = transfer.status === "ready" ? "ready" : transfer.status === "uploading" ? "accepted" : "offer";
      hub.notify(transfer, event);
    }
    sendJson(res, 201, { transfers });
    return;
  }

  const chunkMatch = /^\/api\/transfers\/([a-f0-9]{32})\/chunks$/.exec(url.pathname);
  if (req.method === "PUT" && chunkMatch) {
    const current = store.getOwned(chunkMatch[1], device.id);
    const range = readChunkRange(req, current.size);
    const body = await readBody(req, store.maxChunkSize);
    const transfer = store.toDTO(await store.writeChunk(current.id, device.id, range.start, range.end, body));
    hub.notify(transfer, transfer.status === "ready" ? "ready" : "progress");
    sendJson(res, 200, { transfer });
    return;
  }

  const fileMatch = /^\/api\/transfers\/([a-f0-9]{32})\/file$/.exec(url.pathname);
  if (req.method === "GET" && fileMatch) {
    const transfer = store.getOwned(fileMatch[1], device.id);
    if (transfer.status !== "ready") throw new HttpError(409, "not_ready", "文件还没传完");
    sendFileRange(req, res, store.blobPath(transfer.id), transfer.size, transfer.name, transfer.sha256 || transfer.id);
    return;
  }

  const actionMatch = /^\/api\/transfers\/([a-f0-9]{32})(?:\/(accept|reject|cancel))?$/.exec(url.pathname);
  if (actionMatch && req.method === "GET" && !actionMatch[2]) {
    sendJson(res, 200, { transfer: store.toDTO(store.getOwned(actionMatch[1], device.id)) });
    return;
  }
  if (actionMatch && req.method === "DELETE" && !actionMatch[2]) {
    const id = actionMatch[1];
    const deleted = await store.deleteTransfer(id, device.id);
    if (deleted) {
      hub.notifyDelete(deleted.id, deleted.senderId, deleted.receiverId);
    }
    sendJson(res, 200, { ok: true, id });
    return;
  }
  if (actionMatch && req.method === "POST" && actionMatch[2]) {
    await readBody(req, 1024);
    const id = actionMatch[1];
    let transfer;
    let event;
    if (actionMatch[2] === "accept") {
      transfer = await store.accept(id, device.id);
      event = transfer.status === "ready" ? "ready" : "accepted";
    } else if (actionMatch[2] === "reject") {
      transfer = await store.reject(id, device.id);
      event = "rejected";
    } else {
      transfer = await store.cancel(id, device.id);
      event = "cancelled";
    }
    const dto = store.toDTO(transfer);
    hub.notify(dto, event);
    sendJson(res, 200, { transfer: dto });
    return;
  }

  throw new HttpError(404, "not_found", "没有这个接口");
}

module.exports = { createApp, lanUrls };