import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWithinWorkspace, resolveInsideWorkspace } from "./path-fence.ts";

test("isWithinWorkspace rejects outside paths", () => {
  assert.equal(isWithinWorkspace("/usr/bin", "/tmp/ws"), false);
  assert.equal(isWithinWorkspace("/tmp/ws2/x", "/tmp/ws"), false);
});

test("isWithinWorkspace accepts inside paths", () => {
  assert.equal(isWithinWorkspace("/tmp/ws/a.ts", "/tmp/ws"), true);
  assert.equal(isWithinWorkspace("/tmp/ws", "/tmp/ws"), true);
});

test("isWithinWorkspace rejects .. traversal", () => {
  assert.equal(isWithinWorkspace("/tmp/ws/../etc/passwd", "/tmp/ws"), false);
});

test("resolveInsideWorkspace rejects traversal escaping workspace", () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-fence-"));
  assert.equal(resolveInsideWorkspace("../outside.ts", dir), null);
  const outside = join(tmpdir(), "rampart-outside-" + Math.random());
  writeFileSync(outside, "secret");
  assert.equal(resolveInsideWorkspace(join(dir, "..", "rampart-outside-" + outside.split("rampart-outside-")[1]), dir), null);
});

test("resolveInsideWorkspace rejects symlink escaping workspace", () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-fence-"));
  const outsideFile = join(tmpdir(), `rampart-secret-${Math.random()}.txt`);
  writeFileSync(outsideFile, "secret");
  const link = join(dir, "secret-link.txt");
  symlinkSync(outsideFile, link);
  assert.equal(resolveInsideWorkspace(link, dir), null);
});

test("resolveInsideWorkspace accepts normal inside file", () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-fence-"));
  writeFileSync(join(dir, "a.txt"), "x");
  const r = resolveInsideWorkspace("a.txt", dir);
  assert.ok(r);
  assert.ok(isWithinWorkspace(r, dir));
});