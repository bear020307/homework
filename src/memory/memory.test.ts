import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "./memory.ts";

test("add appends entry and persist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-mem-"));
  const store = new MemoryStore(join(dir, "m.json"));
  await store.add({ type: "convention", tags: ["ts"], content: "use strict types" });
  const all = await store.all();
  assert.equal(all.length, 1);
  assert.ok(all[0].id);
});

test("retrieve filters by tags and limits count (newest first)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-mem-"));
  const store = new MemoryStore(join(dir, "m.json"));
  await store.add({ type: "note", tags: ["a"], content: "first" });
  await store.add({ type: "note", tags: ["a", "b"], content: "second" });
  await store.add({ type: "note", tags: ["b"], content: "third" });
  const r = await store.retrieve({ tags: ["b"] });
  assert.equal(r.length, 2);
  assert.equal(r[0].content, "third");
  const rl = await store.retrieve({ tags: ["b"], limit: 1 });
  assert.equal(rl.length, 1);
  assert.equal(rl[0].content, "third");
});

test("retrieve with no matches returns empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-mem-"));
  const store = new MemoryStore(join(dir, "m.json"));
  await store.add({ type: "note", tags: ["x"], content: "hi" });
  const r = await store.retrieve({ tags: ["nope"] });
  assert.deepEqual(r, []);
});

test("missing file yields empty store", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-mem-"));
  const store = new MemoryStore(join(dir, "nope.json"));
  assert.deepEqual(await store.all(), []);
});