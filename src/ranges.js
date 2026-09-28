"use strict";

// 半开区间 [start, end)。相邻或重叠的区间会合并成一段。

// 把一段新区间并入已排序的区间列表。
function addRange(ranges, start, end) {
  const all = [...ranges, [start, end]].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [partStart, partEnd] of all) {
    if (merged.length === 0 || partStart > merged[merged.length - 1][1]) {
      merged.push([partStart, partEnd]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], partEnd);
    }
  }
  return merged;
}

// 判断新区间和已接收区间的关系：new / covered / overlap。
function classifyRange(ranges, start, end) {
  for (const [partStart, partEnd] of ranges) {
    if (end <= partStart || start >= partEnd) continue;
    if (start >= partStart && end <= partEnd) return "covered";
    return "overlap";
  }
  return "new";
}

// 已接收字节数。
function receivedBytes(ranges) {
  return ranges.reduce((sum, [start, end]) => sum + (end - start), 0);
}

// 文件是否已经从 0 覆盖到 size。空文件视为完整。
function isComplete(ranges, size) {
  if (size === 0) return true;
  return ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === size;
}

// 还缺哪些区间。调用方再按分片大小切开。
function missingRanges(ranges, size) {
  if (size === 0) return [];
  const missing = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) missing.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < size) missing.push([cursor, size]);
  return missing;
}

// 把缺失区间切成不超过 chunkSize 的小块，便于并行上传。
function splitRanges(ranges, chunkSize) {
  const pieces = [];
  for (const [start, end] of ranges) {
    for (let cursor = start; cursor < end; cursor += chunkSize) {
      pieces.push([cursor, Math.min(cursor + chunkSize, end)]);
    }
  }
  return pieces;
}

module.exports = {
  addRange,
  classifyRange,
  receivedBytes,
  isComplete,
  missingRanges,
  splitRanges,
};