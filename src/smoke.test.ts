import test from "node:test";
import assert from "node:assert/strict";

test("smoke: harness test harness works", () => {
  assert.equal(1 + 1, 2);
});