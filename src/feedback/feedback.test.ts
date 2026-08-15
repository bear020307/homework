import test from "node:test";
import assert from "node:assert/strict";
import { parseVerdict } from "./verdict-parser.ts";
import { TestRunner } from "./test-runner.ts";
import { SandboxExecutor } from "../guardrail/sandbox.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

test("parseVerdict maps exit 0 to pass", () => {
  assert.equal(parseVerdict({ exitCode: 0, stdout: "all passing", stderr: "" }), "pass");
});

test("parseVerdict maps non-zero exit to fail", () => {
  assert.equal(parseVerdict({ exitCode: 1, stdout: "1 failed", stderr: "" }), "fail");
});

test("parseVerdict maps null exit to unresolved", () => {
  assert.equal(parseVerdict({ exitCode: null, stdout: "", stderr: "timeout" }), "unresolved");
});

test("parseVerdict with successPattern treats zero exit but bad output as unresolved", () => {
  assert.equal(parseVerdict({ exitCode: 0, stdout: "nothing", stderr: "" }, /passing/), "unresolved");
});

function makeSandbox(ws: string) {
  const allowlist = [ws, "/usr/bin", "/bin", dirname(process.execPath)];
  return new SandboxExecutor({ workspace: ws, pathAllowlist: allowlist, defaultTimeoutMs: 5000 });
}

test("TestRunner runs a passing command in workspace", { timeout: 10000 }, async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-fb-"));
  const tr = new TestRunner(makeSandbox(ws), 5000);
  const r = await tr.run("node -e \"process.exit(0)\"");
  assert.equal(r.exitCode, 0);
});

test("TestRunner runs a failing command", { timeout: 10000 }, async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-fb-"));
  const tr = new TestRunner(makeSandbox(ws), 5000);
  const r = await tr.run("node -e \"process.exit(3)\"");
  assert.equal(r.exitCode, 3);
});