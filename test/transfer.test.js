"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { createApp } = require("../src/app");
const { splitRanges } = require("../src/ranges");

// 每个测试使用独立目录和端口，避免互相污染。
async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lft-"));
  const server = await createApp({
    dataDir,
    chunkSize: 4,
    maxChunkSize: 8,
    maxFileSize: 1024 * 1024,
    maxTotalSize: 8 * 1024 * 1024,
    ttlMs: 60 * 60 * 1000,
    readyTtlMs: 60 * 60 * 1000,
    cleanupIntervalMs: 60 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    port: server.address().port,
    dataDir,
    async stop() {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// 发送 HTTP 请求。默认不使用长连接，方便测试结束时关掉服务。
function request(port, method, requestPath, { json, body, headers, cookie } = {}) {
  const payload = json != null ? Buffer.from(JSON.stringify(json)) : body;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      method,
      path: requestPath,
      agent: false,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(json != null ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
        ...(body ? { "Content-Length": body.length, ...(headers || {}) } : headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        let parsed = null;
        try { parsed = JSON.parse(raw.toString("utf8")); } catch (error) { parsed = null; }
        const setCookie = res.headers["set-cookie"];
        let nextCookie = cookie || "";
        if (setCookie) {
          const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
          nextCookie = first.split(";")[0];
        }
        resolve({ status: res.statusCode, headers: res.headers, body: raw, json: parsed, cookie: nextCookie });
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function openSession(port, name) {
  const response = await request(port, "POST", "/api/session", { json: { name } });
  assert.equal(response.status, 200);
  return {
    id: response.json.device.id,
    token: response.json.token,
    cookie: response.cookie,
    auth: { Authorization: `Bearer ${response.json.token}` },
  };
}

async function uploadChunk(port, session, transfer, start, end, file) {
  return request(port, "PUT", `/api/transfers/${transfer.id}/chunks`, {
    body: file.subarray(start, end),
    headers: {
      ...session.auth,
      "Content-Type": "application/octet-stream",
      "X-Chunk-Start": String(start),
      "X-Chunk-End": String(end),
    },
  });
}

test("网页入口是 UTF-8 中文页面", async () => {
  const ctx = await startServer();
  try {
    const response = await request(ctx.port, "GET", "/");
    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"], /utf-8/);
    assert.match(response.body.toString("utf8"), /局域网文件传输/);
  } finally {
    await ctx.stop();
  }
});

test("分片可乱序上传、重复上传，并按 Range 下载", async () => {
  const ctx = await startServer();
  try {
    const sender = await openSession(ctx.port, "客厅电脑");
    const receiver = await openSession(ctx.port, "手机");
    const file = Buffer.from("abcdefghijklmnopqrstuvwxyz0123456789");
    const created = await request(ctx.port, "POST", "/api/transfers", {
      headers: sender.auth,
      json: {
        receiverId: receiver.id,
        files: [{
          clientFileId: crypto.randomUUID(),
          name: "照片.png",
          size: file.length,
          mime: "image/png",
          lastModified: 10,
        }],
      },
    });
    assert.equal(created.status, 201);
    const transfer = created.json.transfers[0];
    assert.equal(transfer.status, "offered");
    const tooEarly = await uploadChunk(ctx.port, sender, transfer, 0, 4, file);
    assert.equal(tooEarly.status, 409);

    const accepted = await request(ctx.port, "POST", `/api/transfers/${transfer.id}/accept`, {
      headers: receiver.auth,
      json: {},
    });
    assert.equal(accepted.status, 200);
    const head = await uploadChunk(ctx.port, sender, transfer, 0, 4, file);
    assert.equal(head.status, 200);
    const again = await uploadChunk(ctx.port, sender, transfer, 0, 4, file);
    assert.equal(again.status, 200);
    const overlap = await uploadChunk(ctx.port, sender, transfer, 2, 6, file);
    assert.equal(overlap.status, 409);
    const pieces = splitRanges([[0, file.length]], 4).filter((piece) => piece[0] !== 0).reverse();
    await Promise.all(pieces.map(([start, end]) => uploadChunk(ctx.port, sender, transfer, start, end, file).then((response) => {
      assert.equal(response.status, 200);
    })));
    const ready = await request(ctx.port, "GET", `/api/transfers/${transfer.id}`, { headers: receiver.auth });
    assert.equal(ready.json.transfer.status, "ready");
    assert.equal(ready.json.transfer.sha256, crypto.createHash("sha256").update(file).digest("hex"));

    const full = await request(ctx.port, "GET", `/api/transfers/${transfer.id}/file`, { headers: receiver.auth });
    assert.equal(full.status, 200);
    assert.deepEqual(full.body, file);
    assert.match(String(full.headers["content-disposition"]), /UTF-8''/);

    const partial = await request(ctx.port, "GET", `/api/transfers/${transfer.id}/file`, {
      headers: { ...receiver.auth, Range: "bytes=4-10" },
    });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers["content-range"], `bytes 4-10/${file.length}`);
    assert.deepEqual(partial.body, file.subarray(4, 11));

    const stranger = await openSession(ctx.port, "旁观者");
    const denied = await request(ctx.port, "GET", `/api/transfers/${transfer.id}/file`, { headers: stranger.auth });
    assert.equal(denied.status, 403);
  } finally {
    await ctx.stop();
  }
});

test("服务重启后可以接着上次的分片传完", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lft-resume-"));
  const options = {
    dataDir,
    chunkSize: 4,
    maxChunkSize: 8,
    ttlMs: 60 * 60 * 1000,
    readyTtlMs: 60 * 60 * 1000,
    cleanupIntervalMs: 60 * 60 * 1000,
  };
  let server = await createApp(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let port = server.address().port;
  try {
    const sender = await openSession(port, "发送方");
    const receiver = await openSession(port, "接收方");
    const file = Buffer.from("0123456789abcdef");
    const created = await request(port, "POST", "/api/transfers", {
      headers: sender.auth,
      json: {
        receiverId: receiver.id,
        files: [{ clientFileId: crypto.randomUUID(), name: "笔记.txt", size: file.length, mime: "text/plain", lastModified: 1 }],
      },
    });
    const transfer = created.json.transfers[0];
    await request(port, "POST", `/api/transfers/${transfer.id}/accept`, { headers: receiver.auth, json: {} });
    const partial = await uploadChunk(port, sender, transfer, 0, 4, file);
    assert.equal(partial.json.transfer.receivedBytes, 4);
    const clientFileId = transfer.clientFileId;
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

    server = await createApp(options);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    const senderAgain = await request(port, "POST", "/api/session", { json: { deviceId: sender.id, token: sender.token, name: "发送方" } });
    assert.equal(senderAgain.json.device.id, sender.id);
    const resumed = await request(port, "POST", "/api/transfers", {
      headers: { Authorization: `Bearer ${sender.token}` },
      json: {
        receiverId: receiver.id,
        files: [{ clientFileId, name: "笔记.txt", size: file.length, mime: "text/plain", lastModified: 1 }],
      },
    });
    assert.equal(resumed.json.transfers[0].id, transfer.id);
    assert.deepEqual(resumed.json.transfers[0].missing, [[4, file.length]]);
    const pieces = splitRanges(resumed.json.transfers[0].missing, resumed.json.transfers[0].chunkSize);
    for (const [start, end] of pieces) {
      const response = await uploadChunk(port, { auth: { Authorization: `Bearer ${sender.token}` } }, transfer, start, end, file);
      assert.equal(response.status, 200);
    }
    const downloaded = await request(port, "GET", `/api/transfers/${transfer.id}/file`, {
      headers: { Authorization: `Bearer ${receiver.token}` },
    });
    assert.deepEqual(downloaded.body, file);
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("多个文件可以并行登记、空文件可直接接收", async () => {
  const ctx = await startServer();
  try {
    const sender = await openSession(ctx.port, "A");
    const receiver = await openSession(ctx.port, "B");
    const files = [Buffer.from("one"), Buffer.from("two-two"), Buffer.alloc(0)];
    const created = await request(ctx.port, "POST", "/api/transfers", {
      headers: sender.auth,
      json: {
        receiverId: receiver.id,
        batchId: crypto.randomUUID(),
        files: files.map((file, index) => ({
          clientFileId: crypto.randomUUID(),
          name: `f${index}.bin`,
          size: file.length,
          mime: "application/octet-stream",
          lastModified: index,
        })),
      },
    });
    assert.equal(created.json.transfers.length, 3);
    await Promise.all(created.json.transfers.map((transfer) => (
      request(ctx.port, "POST", `/api/transfers/${transfer.id}/accept`, { headers: receiver.auth, json: {} })
    )));
    await Promise.all(created.json.transfers.map(async (transfer, index) => {
      const file = files[index];
      if (file.length === 0) return;
      const pieces = splitRanges([[0, file.length]], 4);
      for (const [start, end] of pieces) {
        const response = await uploadChunk(ctx.port, sender, transfer, start, end, file);
        assert.equal(response.status, 200);
      }
    }));
    for (let index = 0; index < files.length; index += 1) {
      const transfer = created.json.transfers[index];
      const downloaded = await request(ctx.port, "GET", `/api/transfers/${transfer.id}/file`, { headers: receiver.auth });
      assert.equal(downloaded.status, 200);
      assert.deepEqual(downloaded.body, files[index]);
    }
  } finally {
    await ctx.stop();
  }
});

test("WebSocket 能看见新上线的设备", async () => {
  const ctx = await startServer();
  const sockets = [];
  try {
    const first = await openSession(ctx.port, "第一台");
    const seen = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("等待 WebSocket 超时")), 4000);
      sockets.push(connectSocket(ctx.port, first.cookie, (message) => {
        if (message.type === "peers" && message.peers.some((peer) => peer.name === "第二台")) {
          clearTimeout(timer);
          resolve();
        }
      }, reject));
    });
    const second = await openSession(ctx.port, "第二台");
    sockets.push(connectSocket(ctx.port, second.cookie, () => {}, () => {}));
    await seen;
  } finally {
    for (const socket of sockets) socket.end();
    await ctx.stop();
  }
});

test("可以删除传输记录并清理磁盘", async () => {
  const ctx = await startServer();
  try {
    const sender = await openSession(ctx.port, "发送方");
    const receiver = await openSession(ctx.port, "接收方");
    const created = await request(ctx.port, "POST", "/api/transfers", {
      headers: sender.auth,
      json: {
        receiverId: receiver.id,
        files: [{
          clientFileId: crypto.randomUUID(),
          name: "test.txt",
          size: 10,
          mime: "text/plain",
          lastModified: Date.now(),
        }],
      },
    });
    assert.equal(created.status, 201);
    const id = created.json.transfers[0].id;
    const cancelled = await request(ctx.port, "POST", `/api/transfers/${id}/cancel`, { headers: sender.auth });
    assert.equal(cancelled.status, 200);
    const deleted = await request(ctx.port, "DELETE", `/api/transfers/${id}`, { headers: sender.auth });
    assert.equal(deleted.status, 200);
    const list = await request(ctx.port, "GET", "/api/transfers", { headers: sender.auth });
    assert.equal(list.json.transfers.some((t) => t.id === id), false);
  } finally {
    await ctx.stop();
  }
});

function connectSocket(port, cookie, onJson, onError) {
  const socket = net.connect(port, "127.0.0.1");
  let buffer = Buffer.alloc(0);
  let upgraded = false;
  socket.on("error", onError);
  socket.on("connect", () => {
    const key = crypto.randomBytes(16).toString("base64");
    socket.write([
      "GET /ws HTTP/1.1",
      "Host: 127.0.0.1",
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: " + key,
      "Sec-WebSocket-Version: 13",
      "Cookie: " + cookie,
      "",
      "",
    ].join("\r\n"));
  });
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!upgraded) {
      const marker = "\r\n\r\n";
      const splitAt = buffer.indexOf(marker);
      if (splitAt < 0) return;
      const header = buffer.subarray(0, splitAt).toString("utf8");
      if (header.indexOf("101") < 0) onError(new Error(header));
      upgraded = true;
      buffer = buffer.subarray(splitAt + marker.length);
    }
    while (buffer.length >= 2) {
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        return;
      }
      if (buffer.length < offset + length) return;
      const opcode = buffer[0] & 0x0f;
      const payload = buffer.subarray(offset, offset + length);
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x1) onJson(JSON.parse(payload.toString("utf8")));
    }
  });
  return socket;
}
