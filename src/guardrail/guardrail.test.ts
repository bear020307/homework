import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GuardrailPipeline } from "./guardrail.ts";
import { defaultConfig } from "../config/config.ts";

function setup() {
  const ws = mkdtempSync(join(tmpdir(), "rampart-guard-"));
  const cfg = defaultConfig(ws);
  const g = new GuardrailPipeline(ws, cfg);
  return { ws, cfg, g };
}

test("blocks rm -rf", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "rm -rf src" });
  assert.equal(v.kind, "block");
  assert.equal(v.ruleId, "rm-rf");
});

test("blocks sudo regardless of args", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "sudo whoami" });
  assert.equal(v.kind, "block");
});

test("approves git push --force", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "git push --force origin main" });
  assert.equal(v.kind, "approve");
});

test("allows git push (no force)", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "git push origin main" });
  assert.equal(v.kind, "allow");
});

test("denies unlisted command by default", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "what-caches -x" });
  assert.equal(v.kind, "deny");
});

test("allows unlisted command when policy is allow", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-guard-"));
  const cfg = defaultConfig(ws);
  cfg.guardrail.defaultPolicyForSpawn = "allow";
  const g = new GuardrailPipeline(ws, cfg);
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "what-caches -x" });
  assert.equal(v.kind, "allow");
});

test("blocks write_file outside workspace", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "write_file", path: "/etc/passwd", content: "x" });
  assert.equal(v.kind, "block");
});

test("allows write_file inside workspace", async () => {
  const { g, ws } = setup();
  const v = await g.evaluate({ id: "1", kind: "write_file", path: join(ws, "new.txt"), content: "x" });
  assert.equal(v.kind, "allow");
});

test("blocks write_file escaping via ..", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "write_file", path: "sub/../../outside.txt", content: "x" });
  assert.equal(v.kind, "block");
});

test("note and stop bypass guardrail as allow", async () => {
  const { g } = setup();
  assert.equal((await g.evaluate({ id: "1", kind: "note", text: "x" })).kind, "allow");
  assert.equal((await g.evaluate({ id: "1", kind: "stop" })).kind, "allow");
});

test("run_tests without command is allowed", async () => {
  const { g } = setup();
  assert.equal((await g.evaluate({ id: "1", kind: "run_tests" })).kind, "allow");
});

test("run_tests with dangerous command is blocked", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_tests", command: "rm -rf node_modules" });
  assert.equal(v.kind, "block");
});