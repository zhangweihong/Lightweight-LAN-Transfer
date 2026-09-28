"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { addRange, classifyRange, isComplete, missingRanges, splitRanges, receivedBytes } = require("../src/ranges");

test("区间会合并，并能算出缺口", () => {
  let ranges = addRange([], 0, 10);
  ranges = addRange(ranges, 20, 30);
  ranges = addRange(ranges, 10, 20);
  assert.deepEqual(ranges, [[0, 30]]);
  assert.equal(receivedBytes(ranges), 30);
  assert.equal(isComplete(ranges, 30), true);
  assert.deepEqual(missingRanges([[0, 10], [20, 30]], 40), [[10, 20], [30, 40]]);
  assert.deepEqual(splitRanges([[0, 10]], 4), [[0, 4], [4, 8], [8, 10]]);
  assert.equal(classifyRange([[0, 10]], 2, 5), "covered");
  assert.equal(classifyRange([[0, 10]], 8, 12), "overlap");
  assert.equal(classifyRange([[0, 10]], 10, 12), "new");
  assert.equal(isComplete([], 0), true);
});