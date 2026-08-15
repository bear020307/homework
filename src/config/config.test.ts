import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, defaultConfig, validateConfig, ConfigError } from "./config.ts";

test("defaultConfig has sane governance defaults", () => {
  const c = defaultConfig("/tmp/ws");
  assert.equal(c.workspace, "/tmp/ws");
  assert.equal(c.guardrail.defaultPolicyForSpawn, "deny");
  assert.ok(c.loop.maxSteps >= 1);
  assert.ok(c.guardrail.deny.some((r) => r.id === "rm-rf"));
  assert.ok(c.guardrail.approve.some((r) => r.id === "git-push-force"));
});

test("validateConfig rejects bad maxSteps", () => {
  assert.throws(() => validateConfig({ loop: { maxSteps: 0 } }, "/tmp/ws"), ConfigError);
});

test("validateConfig rejects missing workspace", () => {
  assert.throws(() => validateConfig({}, ""), ConfigError);
});

test("validateConfig applies allow policy override", () => {
  const c = validateConfig({ guardrail: { defaultPolicyForSpawn: "allow" } }, "/tmp/ws");
  assert.equal(c.guardrail.defaultPolicyForSpawn, "allow");
});

test("loadConfig reads file and merges defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-cfg-"));
  const file = join(dir, "h.json");
  writeFileSync(file, JSON.stringify({ loop: { maxSteps: 5 } }));
  const c = loadConfig(file);
  assert.equal(c.loop.maxSteps, 5);
  assert.equal(c.guardrail.defaultPolicyForSpawn, "deny");
});

test("loadConfig throws when file missing", () => {
  assert.throws(() => loadConfig("/nonexistent/rampart.json"), Error);
});