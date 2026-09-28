"use strict";

const crypto = require("crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// 把一帧 WebSocket 数据编码成服务器发出的未掩码帧。
function encodeFrame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const length = body.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, body]);
}

// 解析浏览器发来的掩码帧，支持分片文本、ping 和 close。
class FrameParser {
  constructor(handlers) {
    this.handlers = handlers;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = 0;
  }

  feed(chunk) {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > 2 * 1024 * 1024) {
      throw new Error("WebSocket 消息过大");
    }
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(2 * 1024 * 1024)) throw new Error("WebSocket 帧过大");
        length = Number(big);
        offset = 10;
      }
      if (!masked) throw new Error("客户端帧必须掩码");
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      this.buffer = this.buffer.subarray(offset + 4 + length);
      this._onFrame(fin, opcode, payload);
    }
  }

  _onFrame(fin, opcode, payload) {
    if (opcode === 0x8) {
      this.handlers.onClose?.();
      return;
    }
    if (opcode === 0x9) {
      this.handlers.onPing?.(payload);
      return;
    }
    if (opcode === 0xA) {
      this.handlers.onPong?.();
      return;
    }
    if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
      if (opcode !== 0x0) {
        this.fragments = [];
        this.fragmentOpcode = opcode;
      } else if (!this.fragmentOpcode) {
        throw new Error("孤立的 WebSocket 续帧");
      }
      this.fragments.push(payload);
      if (!fin) return;
      const message = Buffer.concat(this.fragments);
      const messageOpcode = this.fragmentOpcode;
      this.fragments = [];
      this.fragmentOpcode = 0;
      if (messageOpcode === 0x1) this.handlers.onText?.(message.toString("utf8"));
      return;
    }
    throw new Error("不支持的 WebSocket 帧");
  }
}

// 完成 HTTP 升级，后续数据交给 FrameParser。
function acceptUpgrade(req, socket, head, handlers) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return null;
  }
  const accept = crypto.createHash("sha1").update(String(key) + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  const parser = new FrameParser(handlers);
  if (head && head.length) parser.feed(head);
  socket.on("data", (chunk) => {
    try {
      parser.feed(chunk);
    } catch (error) {
      socket.destroy();
    }
  });
  return parser;
}

module.exports = { encodeFrame, acceptUpgrade };