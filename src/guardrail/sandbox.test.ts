import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { SandboxExecutor } from "./sandbox.ts";

function setup() {
  const ws = mkdtempSync(join(tmpdir(), "rampart-sandbox-"));
  const allowlist = [ws, "/usr/bin", "/bin", dirname(process.execPath)];
  const sx = new SandboxExecutor({ workspace: ws, pathAllowlist: allowlist, defaultTimeoutMs: 5000 });
  return { ws, sx };
}

test("runs allowed command and captures stdout/exitCode", { timeout: 10000 }, async () => {
  const { ws, sx } = setup();
  writeFileSync(join(ws, "a.txt"), "hello");
  const r = await sx.run("cat a.txt", { cwd: ws });
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout.trim(), "hello");
});

test("returns non-zero exitCode on command failure", { timeout: 10000 }, async () => {
  const { sx } = setup();
  const r = await sx.run("false");
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
});

test("rejects cwd escaping workspace", async () => {
  const { sx } = setup();
  const r = await sx.run("ls", { cwd: "/tmp" });
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, null);
  assert.ok(r.stderr.length > 0);
});

test("times out and kills long-running command", { timeout: 10000 }, async () => {
  const { sx } = setup();
  const r = await sx.run("sleep 30", { timeoutMs: 200 });
  assert.equal(r.timedOut, true);
});