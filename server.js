"use strict";

const { createApp, lanUrls } = require("./src/app");

// 读取正数环境变量，未设置时使用默认值。
function readNumber(name, fallback) {
  if (process.env[name] == null || process.env[name] === "") return fallback;
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name} 必须是正数`);
    process.exit(1);
  }
  return value;
}

// 启动局域网文件传输服务。
async function main() {
  const port = readNumber("PORT", 3780);
  const host = process.env.HOST || "0.0.0.0";
  const server = await createApp({
    dataDir: process.env.DATA_DIR || "data",
    chunkSize: readNumber("CHUNK_SIZE", 4 * 1024 * 1024),
    maxChunkSize: readNumber("MAX_CHUNK_SIZE", 8 * 1024 * 1024),
    maxFileSize: readNumber("MAX_FILE_SIZE", 50 * 1024 * 1024 * 1024),
    maxTotalSize: readNumber("MAX_TOTAL_SIZE", 100 * 1024 * 1024 * 1024),
    ttlMs: readNumber("TTL_HOURS", 12) * 60 * 60 * 1000,
    readyTtlMs: readNumber("READY_TTL_HOURS", 6) * 60 * 60 * 1000,
  });
  if (server.store.chunkSize > server.store.maxChunkSize) {
    console.error("CHUNK_SIZE 不能大于 MAX_CHUNK_SIZE");
    process.exit(1);
  }
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") console.error(`端口 ${port} 已被占用。可以换一个，例如：$env:PORT=3781; npm start`);
    else console.error(error);
    process.exit(1);
  });
  server.listen(port, host, () => {
    const actualPort = server.address().port;
    const urls = lanUrls(actualPort);
    console.log("局域网文件传输已启动");
    console.log(`本机打开: http://127.0.0.1:${actualPort}`);
    if (urls.length === 0) {
      console.log("没有发现可用的局域网 IPv4。请确认这台电脑已经连上 Wi-Fi 或网线。");
    } else {
      console.log("手机、其他电脑、Mac 请打开下面任一地址（需在同一局域网）:");
      for (const url of urls) console.log(`  ${url}`);
    }
    console.log(`暂存目录: ${server.store.root}`);
    console.log("按 Ctrl+C 停止服务。");
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}