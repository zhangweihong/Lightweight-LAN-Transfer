"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { HttpError } = require("./errors");
const { addRange, classifyRange, receivedBytes, isComplete, missingRanges } = require("./ranges");

const ACTIVE = new Set(["offered", "uploading", "ready"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// 串行化同一把钥匙上的异步操作，避免元数据写坏。
function createLock() {
  const tails = new Map();
  return function lock(key, fn) {
    const prev = tails.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.then(() => {}, () => {});
    tails.set(key, tail);
    tail.finally(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return run;
  };
}

// 先写临时文件再替换，避免写到一半断电后读到半截 JSON。
async function atomicWrite(file, text) {
  const tmp = `${file}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, text, "utf8");
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(file, { force: true });
      await fs.rename(tmp, file);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  try {
    await fs.copyFile(tmp, file);
    await fs.rm(tmp, { force: true });
  } catch (error) {
    if (await pathExists(file)) return;
    const parentGone = error.code === "ENOENT" && !(await pathExists(path.dirname(file)));
    if (parentGone) return;
    throw lastError || error;
  }
}

async function pathExists(file) {
  try {
    await fs.stat(file);
    return true;
  } catch (error) {
    return false;
  }
}

// 只保留安全的显示文件名，去掉路径和不可见控制字符。
function safeFileName(name) {
  const base = String(name || "未命名").split(/[/\\]/).pop() || "未命名";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 180);
  return cleaned || "未命名";
}

// 设备名允许中文，限制长度，避免空白名称。
function cleanDeviceName(name, fallback) {
  const cleaned = String(name || "").replace(/[\u0000-\u001f]/g, "").trim();
  const chars = Array.from(cleaned);
  const sliced = chars.slice(0, 40).join("");
  return sliced || fallback;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

// 传输记录、设备身份和分片文件都落在 data 目录。
class Store {
  constructor(options = {}) {
    this.root = path.resolve(options.dataDir || path.join(process.cwd(), "data"));
    this.chunkSize = options.chunkSize || 4 * 1024 * 1024;
    this.maxChunkSize = options.maxChunkSize || 8 * 1024 * 1024;
    this.maxFileSize = options.maxFileSize || 50 * 1024 * 1024 * 1024;
    this.maxTotalSize = options.maxTotalSize || 100 * 1024 * 1024 * 1024;
    this.ttlMs = options.ttlMs ?? 12 * 60 * 60 * 1000;
    this.readyTtlMs = options.readyTtlMs ?? 6 * 60 * 60 * 1000;
    this.lock = createLock();
    this.devices = new Map();
    this.byToken = new Map();
    this.transfers = new Map();
    this.inflight = new Set();
  }

  // 启动时加载设备表，并按磁盘上的分片恢复未完成传输。
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    await this._loadDevices();
    await this._loadTransfers();
  }

  async _loadDevices() {
    const file = this._deviceFile();
    if (!(await pathExists(file))) return;
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    for (const [id, device] of Object.entries(parsed.devices || {})) {
      if (!device || !device.tokenHash) continue;
      this.devices.set(id, device);
      this.byToken.set(device.tokenHash, id);
    }
  }

  async _loadTransfers() {
    const base = path.join(this.root, "transfers");
    await fs.mkdir(base, { recursive: true });
    const entries = await fs.readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9]{32}$/.test(entry.name)) continue;
      const metaPath = path.join(base, entry.name, "meta.json");
      try {
        const transfer = JSON.parse(await fs.readFile(metaPath, "utf8"));
        await this._reconcile(transfer);
        this.transfers.set(transfer.id, transfer);
      } catch (error) {
        console.error(`跳过损坏的传输 ${entry.name}: ${error.message}`);
      }
    }
  }

  _deviceFile() {
    return path.join(this.root, "devices.json");
  }

  _transferDir(id) {
    return path.join(this.root, "transfers", id);
  }

  blobPath(id) {
    return path.join(this._transferDir(id), "blob");
  }

  // 用令牌找回设备。令牌只存哈希。
  deviceByToken(token) {
    if (!token) return null;
    const id = this.byToken.get(hashToken(token));
    if (!id) return null;
    return this.devices.get(id) || null;
  }

  device(id) {
    return this.devices.get(id) || null;
  }

  // 创建或恢复一台设备。浏览器把 deviceId 和 token 存在本地。
  async openSession({ deviceId, token, name }) {
    return this.lock("devices", async () => {
      const now = Date.now();
      if (token) {
        const existing = this.deviceByToken(token);
        if (existing && (!deviceId || deviceId === existing.id)) {
          // 恢复会话时不覆盖用户已经改过的设备名，改名走单独接口。
          existing.lastSeen = now;
          await this._persistDevices();
          return { device: this._publicDevice(existing), token };
        }
      }
      let id = typeof deviceId === "string" && UUID_RE.test(deviceId) && !this.devices.has(deviceId)
        ? deviceId
        : crypto.randomUUID();
      const nextToken = crypto.randomBytes(32).toString("hex");
      const device = {
        id,
        tokenHash: hashToken(nextToken),
        name: cleanDeviceName(name, "新设备"),
        createdAt: now,
        lastSeen: now,
      };
      this.devices.set(id, device);
      this.byToken.set(device.tokenHash, id);
      await this._persistDevices();
      return { device: this._publicDevice(device), token: nextToken };
    });
  }

  // 修改自己的显示名。
  async rename(deviceId, name) {
    return this.lock("devices", async () => {
      const device = this.devices.get(deviceId);
      if (!device) throw new HttpError(401, "unauthorized", "设备身份已失效，请刷新页面");
      device.name = cleanDeviceName(name, device.name);
      device.lastSeen = Date.now();
      await this._persistDevices();
      return this._publicDevice(device);
    });
  }

  async touch(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return;
    device.lastSeen = Date.now();
    await this.lock("devices", () => this._persistDevices());
  }

  async _persistDevices() {
    const devices = {};
    for (const [id, device] of this.devices) devices[id] = device;
    await atomicWrite(this._deviceFile(), JSON.stringify({ devices }));
  }

  _publicDevice(device) {
    return { id: device.id, name: device.name };
  }

  // 一次可以登记多个文件。相同 clientFileId 的未完成任务会直接复用，用来续传。
  async createTransfers(senderId, input) {
    const receiver = this.devices.get(input.receiverId);
    if (!receiver) throw new HttpError(404, "receiver_offline", "对方还没打开页面，或设备已失效");
    if (receiver.id === senderId) throw new HttpError(400, "self", "不能给自己发文件");
    if (!Array.isArray(input.files) || input.files.length === 0) {
      throw new HttpError(400, "no_files", "请至少选择一个文件");
    }
    if (input.files.length > 100) throw new HttpError(400, "too_many", "一次最多 100 个文件");
    const batchId = typeof input.batchId === "string" && UUID_RE.test(input.batchId)
      ? input.batchId
      : crypto.randomUUID();
    const created = [];
    for (const file of input.files) created.push(await this._createOne(senderId, receiver.id, batchId, file));
    return created.map((item) => this.toDTO(item));
  }

  async _createOne(senderId, receiverId, batchId, file) {
    return this.lock("capacity", async () => {
      const name = safeFileName(file.name);
      const size = file.size;
      const clientFileId = String(file.clientFileId || "");
      if (!UUID_RE.test(clientFileId)) throw new HttpError(400, "bad_file_id", "文件编号无效");
      if (!Number.isSafeInteger(size) || size < 0) throw new HttpError(400, "bad_size", "文件大小无效");
      if (size > this.maxFileSize) throw new HttpError(413, "file_too_large", "单个文件超过服务允许的大小");
      const existing = this._findResume(senderId, receiverId, clientFileId, name, size);
      if (existing) return existing;
      this._assertCapacity(size);
      const now = Date.now();
      const transfer = {
        id: crypto.randomBytes(16).toString("hex"),
        batchId,
        senderId,
        receiverId,
        clientFileId,
        name,
        mime: String(file.mime || "application/octet-stream").slice(0, 200),
        lastModified: Number.isFinite(Number(file.lastModified)) ? Number(file.lastModified) : 0,
        size,
        chunkSize: this.chunkSize,
        status: "offered",
        ranges: [],
        receivedBytes: 0,
        sha256: null,
        createdAt: now,
        updatedAt: now,
        acceptedAt: null,
        readyAt: null,
      };
      this.transfers.set(transfer.id, transfer);
      await fs.mkdir(path.join(this._transferDir(transfer.id), "parts"), { recursive: true });
      await this._persistTransfer(transfer);
      return transfer;
    });
  }

  _findResume(senderId, receiverId, clientFileId, name, size) {
    for (const transfer of this.transfers.values()) {
      if (transfer.senderId !== senderId || transfer.receiverId !== receiverId) continue;
      if (transfer.clientFileId !== clientFileId) continue;
      if (!ACTIVE.has(transfer.status)) continue;
      if (transfer.name !== name || transfer.size !== size) continue;
      return transfer;
    }
    return null;
  }

  _assertCapacity(extra) {
    let used = 0;
    for (const transfer of this.transfers.values()) {
      if (!ACTIVE.has(transfer.status)) continue;
      used += transfer.size;
    }
    if (used + extra > this.maxTotalSize) {
      throw new HttpError(507, "disk_quota", "服务端暂存空间已满，请等已有传输完成或过期");
    }
  }

  // 接收方同意后，发送方才可以开始上传分片。
  async accept(id, deviceId) {
    return this.lock(id, async () => {
      const transfer = this._must(id);
      if (transfer.receiverId !== deviceId) throw new HttpError(403, "forbidden", "只有接收方可以同意");
      if (transfer.status === "uploading" || transfer.status === "ready") return this.clone(transfer);
      if (transfer.status !== "offered") throw new HttpError(409, "bad_state", "这个传输已经结束");
      transfer.status = "uploading";
      transfer.acceptedAt = Date.now();
      transfer.updatedAt = transfer.acceptedAt;
      if (transfer.size === 0) await this._finalize(transfer, []);
      else await this._persistTransfer(transfer);
      return this.clone(transfer);
    });
  }

  // 接收方拒绝尚未开始的传输。
  async reject(id, deviceId) {
    return this.lock(id, async () => {
      const transfer = this._must(id);
      if (transfer.receiverId !== deviceId) throw new HttpError(403, "forbidden", "只有接收方可以拒绝");
      if (transfer.status !== "offered") throw new HttpError(409, "bad_state", "已经开始的传输不能拒绝，请取消");
      transfer.status = "rejected";
      transfer.updatedAt = Date.now();
      await this._persistTransfer(transfer);
      return this.clone(transfer);
    });
  }

  // 任意一方都可以取消，已写入的分片会删掉。
  async cancel(id, deviceId) {
    return this.lock(id, async () => {
      const transfer = this._must(id);
      if (transfer.senderId !== deviceId && transfer.receiverId !== deviceId) {
        throw new HttpError(403, "forbidden", "不能取消别人的传输");
      }
      if (transfer.status === "cancelled" || transfer.status === "rejected" || transfer.status === "expired") {
        return this.clone(transfer);
      }
      transfer.status = "cancelled";
      transfer.updatedAt = Date.now();
      await this._deletePayload(transfer.id);
      await this._persistTransfer(transfer);
      return this.clone(transfer);
    });
  }

  // 删除传输记录并清理暂存文件。
  async deleteTransfer(id, deviceId) {
    return this.lock(id, async () => {
      const transfer = this.transfers.get(id);
      if (!transfer) return null;
      if (transfer.senderId !== deviceId && transfer.receiverId !== deviceId) {
        throw new HttpError(403, "forbidden", "不能删除别人的传输");
      }
      this.transfers.delete(id);
      await this._deletePayload(id);
      try {
        await fs.rm(this._transferDir(id), { recursive: true, force: true });
      } catch (error) {
        // 目录可能已清理
      }
      return { id: transfer.id, senderId: transfer.senderId, receiverId: transfer.receiverId };
    });
  }

  // 写入一个分片。完全重复的分片直接当成功，重叠但不相同的分片会被拒绝。
  async writeChunk(id, deviceId, start, end, buffer) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) {
      throw new HttpError(400, "bad_range", "分片范围无效");
    }
    if (buffer.length !== end - start) throw new HttpError(400, "bad_chunk", "分片长度和范围不一致");
    if (end - start > this.maxChunkSize) throw new HttpError(413, "chunk_too_large", "分片过大");
    const key = `${id}:${start}-${end}`;
    const reserved = await this.lock(id, async () => {
      const transfer = this._must(id);
      if (transfer.senderId !== deviceId) throw new HttpError(403, "forbidden", "只有发送方可以上传");
      if (transfer.status !== "uploading") throw new HttpError(409, "bad_state", "对方还没接收，或传输已结束");
      if (start < 0 || end > transfer.size) throw new HttpError(400, "bad_range", "分片超出文件范围");
      const kind = classifyRange(transfer.ranges, start, end);
      if (kind === "covered") return { done: true, transfer: this.clone(transfer) };
      if (kind === "overlap") throw new HttpError(409, "overlap", "分片与已收到的数据重叠");
      if (this.inflight.has(key)) throw new HttpError(409, "busy", "这个分片正在写入，请稍后重试");
      this.inflight.add(key);
      return { done: false };
    });
    if (reserved.done) return reserved.transfer;
    try {
      await this._writePart(id, start, end, buffer);
      return await this.lock(id, async () => {
        const transfer = this._must(id);
        if (transfer.status !== "uploading") {
          await this._removePart(id, start, end);
          throw new HttpError(409, "bad_state", "传输已结束");
        }
        const committed = classifyRange(transfer.ranges, start, end);
        if (committed === "overlap") {
          await this._removePart(id, start, end);
          throw new HttpError(409, "overlap", "分片与已收到的数据重叠");
        }
        if (committed === "new") {
          transfer.ranges = addRange(transfer.ranges, start, end);
          transfer.receivedBytes = receivedBytes(transfer.ranges);
          transfer.updatedAt = Date.now();
        }
        if (isComplete(transfer.ranges, transfer.size)) {
          const parts = await this._readParts(id);
          await this._finalize(transfer, parts);
        } else {
          await this._persistTransfer(transfer);
        }
        return this.clone(transfer);
      });
    } finally {
      this.inflight.delete(key);
    }
  }

  getOwned(id, deviceId) {
    const transfer = this._must(id);
    if (transfer.senderId !== deviceId && transfer.receiverId !== deviceId) {
      throw new HttpError(403, "forbidden", "不能查看别人的文件");
    }
    return this.clone(transfer);
  }

  listFor(deviceId) {
    const list = [];
    for (const transfer of this.transfers.values()) {
      if (transfer.senderId !== deviceId && transfer.receiverId !== deviceId) continue;
      list.push(this.toDTO(transfer));
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.slice(0, 200);
  }

  toDTO(transfer) {
    const sender = this.devices.get(transfer.senderId);
    const receiver = this.devices.get(transfer.receiverId);
    const size = transfer.size;
    return {
      id: transfer.id,
      batchId: transfer.batchId,
      senderId: transfer.senderId,
      receiverId: transfer.receiverId,
      senderName: sender ? sender.name : "未知设备",
      receiverName: receiver ? receiver.name : "未知设备",
      clientFileId: transfer.clientFileId,
      name: transfer.name,
      mime: transfer.mime,
      lastModified: transfer.lastModified,
      size,
      chunkSize: transfer.chunkSize,
      status: transfer.status,
      receivedBytes: transfer.receivedBytes,
      missing: missingRanges(transfer.ranges || [], size),
      sha256: transfer.sha256,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      percent: size === 0 ? 1 : transfer.receivedBytes / size,
    };
  }

  clone(transfer) {
    return structuredClone(transfer);
  }

  _must(id) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(404, "not_found", "找不到这个传输");
    const transfer = this.transfers.get(id);
    if (!transfer) throw new HttpError(404, "not_found", "找不到这个传输");
    return transfer;
  }

  async _writePart(id, start, end, buffer) {
    const dir = path.join(this._transferDir(id), "parts");
    await fs.mkdir(dir, { recursive: true });
    const finalPath = path.join(dir, `${start}-${end}.part`);
    const tmp = path.join(dir, `${start}-${end}.${crypto.randomBytes(4).toString("hex")}.tmp`);
    await fs.writeFile(tmp, buffer);
    await fs.rm(finalPath, { force: true });
    try {
      await fs.rename(tmp, finalPath);
    } catch (error) {
      await fs.copyFile(tmp, finalPath);
      await fs.rm(tmp, { force: true });
    }
  }

  async _removePart(id, start, end) {
    await fs.rm(path.join(this._transferDir(id), "parts", `${start}-${end}.part`), { force: true });
  }

  async _readParts(id) {
    const dir = path.join(this._transferDir(id), "parts");
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      return [];
    }
    const parts = [];
    for (const name of names) {
      const matched = /^(\d+)-(\d+)\.part$/.exec(name);
      if (!matched) continue;
      const start = Number(matched[1]);
      const end = Number(matched[2]);
      const filePath = path.join(dir, name);
      const stat = await fs.stat(filePath);
      if (stat.size !== end - start) continue;
      parts.push({ start, end, path: filePath });
    }
    parts.sort((a, b) => a.start - b.start || a.end - b.end);
    return parts;
  }

  // 按顺序拼成分片文件，并计算 SHA-256。完成后才允许下载。
  async _finalize(transfer, parts) {
    const blob = this.blobPath(transfer.id);
    const tmp = `${blob}.tmp`;
    const hash = crypto.createHash("sha256");
    const handle = await fs.open(tmp, "w");
    let cursor = 0;
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      for (const part of parts) {
        if (part.start < cursor) continue;
        if (part.start !== cursor) throw new Error("分片不连续，无法合并");
        const input = await fs.open(part.path, "r");
        try {
          let position = 0;
          while (position < part.end - part.start) {
            const { bytesRead } = await input.read(buffer, 0, buffer.length, position);
            if (!bytesRead) break;
            hash.update(buffer.subarray(0, bytesRead));
            await handle.write(buffer, 0, bytesRead, cursor);
            cursor += bytesRead;
            position += bytesRead;
          }
        } finally {
          await input.close();
        }
      }
    } catch (error) {
      await handle.close();
      await fs.rm(tmp, { force: true });
      throw error;
    }
    await handle.close();
    if (cursor !== transfer.size) {
      await fs.rm(tmp, { force: true });
      throw new Error("合并后的大小和原文件不一致");
    }
    await fs.rm(blob, { force: true });
    try {
      await fs.rename(tmp, blob);
    } catch (error) {
      await fs.copyFile(tmp, blob);
      await fs.rm(tmp, { force: true });
    }
    transfer.status = "ready";
    transfer.sha256 = transfer.size === 0 ? EMPTY_SHA256 : hash.digest("hex");
    transfer.receivedBytes = transfer.size;
    transfer.ranges = transfer.size === 0 ? [] : [[0, transfer.size]];
    transfer.readyAt = Date.now();
    transfer.updatedAt = transfer.readyAt;
    await this._persistTransfer(transfer);
    await fs.rm(path.join(this._transferDir(transfer.id), "parts"), { recursive: true, force: true });
  }

  async _persistTransfer(transfer) {
    const dir = this._transferDir(transfer.id);
    await fs.mkdir(dir, { recursive: true });
    await atomicWrite(path.join(dir, "meta.json"), JSON.stringify(transfer));
  }

  async _deletePayload(id) {
    await fs.rm(this.blobPath(id), { force: true });
    await fs.rm(`${this.blobPath(id)}.tmp`, { force: true });
    await fs.rm(path.join(this._transferDir(id), "parts"), { recursive: true, force: true });
  }

  // 服务重启后，以磁盘分片为准修复进度；完整文件则直接收尾。
  async _reconcile(transfer) {
    if (!ACTIVE.has(transfer.status)) return;
    const blob = this.blobPath(transfer.id);
    if (await pathExists(blob)) {
      const stat = await fs.stat(blob);
      if (stat.size === transfer.size) {
        transfer.status = "ready";
        transfer.receivedBytes = transfer.size;
        transfer.ranges = transfer.size === 0 ? [] : [[0, transfer.size]];
        transfer.readyAt = transfer.readyAt || Date.now();
        await this._persistTransfer(transfer);
        await fs.rm(path.join(this._transferDir(transfer.id), "parts"), { recursive: true, force: true });
        return;
      }
    }
    if (transfer.status === "offered") return;
    const parts = await this._readParts(transfer.id);
    let ranges = [];
    let cursor = 0;
    for (const part of parts) {
      if (part.start < cursor) {
        await fs.rm(part.path, { force: true });
        continue;
      }
      ranges = addRange(ranges, part.start, part.end);
      cursor = part.end;
    }
    transfer.ranges = ranges;
    transfer.receivedBytes = receivedBytes(ranges);
    if (transfer.status === "uploading" && isComplete(ranges, transfer.size)) {
      const freshParts = await this._readParts(transfer.id);
      await this._finalize(transfer, freshParts);
      return;
    }
    await this._persistTransfer(transfer);
  }

  // 过期任务删除暂存文件，避免磁盘被占满。
  async cleanup(now = Date.now()) {
    const expired = [];
    for (const transfer of [...this.transfers.values()]) {
      if (this.inflightHas(transfer.id)) continue;
      const age = now - transfer.updatedAt;
      const limit = transfer.status === "ready" ? this.readyTtlMs : this.ttlMs;
      const terminal = transfer.status === "cancelled" || transfer.status === "rejected" || transfer.status === "expired";
      if (terminal && age > this.ttlMs) {
        await this.lock(transfer.id, async () => {
          this.transfers.delete(transfer.id);
          await fs.rm(this._transferDir(transfer.id), { recursive: true, force: true });
        });
        continue;
      }
      if (!ACTIVE.has(transfer.status) || age <= limit) continue;
      const updated = await this.lock(transfer.id, async () => {
        if (transfer.status === "expired") return null;
        transfer.status = "expired";
        transfer.updatedAt = Date.now();
        await this._deletePayload(transfer.id);
        await this._persistTransfer(transfer);
        return this.clone(transfer);
      });
      if (updated) expired.push(this.toDTO(updated));
    }
    return expired;
  }

  inflightHas(id) {
    for (const key of this.inflight) {
      if (key.startsWith(`${id}:`)) return true;
    }
    return false;
  }
}

module.exports = { Store, safeFileName, UUID_RE };