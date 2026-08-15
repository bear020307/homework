import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { makeExecutor } from "./executor.ts";
import { SandboxExecutor } from "../guardrail/sandbox.ts";
import { MemoryStore } from "../memory/memory.ts";

function makeSandbox(ws: string) {
  const allowlist = [ws, "/usr/bin", "/bin", dirname(process.execPath)];
  return new SandboxExecutor({ workspace: ws, pathAllowlist: allowlist, defaultTimeoutMs: 5000 });
}

test("read_file returns content", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  writeFileSync(join(ws, "a.txt"), "hello world");
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "read_file", path: join(ws, "a.txt") });
  assert.equal(r.ok, true);
  assert.match(r.output, /hello world/);
});

test("write_file writes to disk", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "write_file", path: join(ws, "b.txt"), content: "payload" });
  assert.equal(r.ok, true);
  const { readFileSync } = await import("node:fs");
  assert.equal(readFileSync(join(ws, "b.txt"), "utf8"), "payload");
});

test("run_command executes via sandbox", { timeout: 10000 }, async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "run_command", command: "echo hi" });
  assert.equal(r.ok, true);
  assert.match(r.output, /hi/);
});

test("run_tests uses provided command", { timeout: 10000 }, async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "run_tests", command: "node -e \"process.exit(0)\"" });
  assert.equal(r.ok, true);
});

test("note writes to memory", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const mem = new MemoryStore(join(ws, "m.json"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: mem });
  const r = await ex({ id: "1", kind: "note", text: "remember this", tags: ["conv"] });
  assert.equal(r.ok, true);
  const all = await mem.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].content, "remember this");
});

test("read_file outside workspace fails even via absolute path", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  writeFileSync(join(tmpdir(), `rampart-outside-${Math.random()}.txt`), "secret");
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "read_file", path: "/etc/passwd" });
  assert.equal(r.ok, false);
});

test("write_file refuses a path resolving outside workspace via ..", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "write_file", path: "../../etc/escape.txt", content: "boom" });
  assert.equal(r.ok, false);
});