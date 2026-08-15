import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRunFlags } from "./index.ts";

test("collects positional args while skipping flag values", () => {
  const o = parseRunFlags(["-c", "cfg.json", "-w", "/ws", "task arg", "--mock"]);
  assert.deepEqual(o.positionalArgs, ["task arg"]);
  assert.equal(o.config, "cfg.json");
  assert.equal(o.workspace, "/ws");
  assert.equal(o.mock, true);
});

test("long flags set their values", () => {
  const o = parseRunFlags(["--config", "a.json", "--workspace", "/x", "--llm-model", "gpt-4"]);
  assert.equal(o.config, "a.json");
  assert.equal(o.workspace, "/x");
  assert.equal(o.model, "gpt-4");
});

test("--mock sets boolean without consuming an arg", () => {
  const o = parseRunFlags(["--mock", "do the thing"]);
  assert.equal(o.mock, true);
  assert.deepEqual(o.positionalArgs, ["do the thing"]);
});

test("everything after -- is positional", () => {
  const o = parseRunFlags(["-w", "/ws", "--", "--mock", "literal arg"]);
  assert.deepEqual(o.positionalArgs, ["--mock", "literal arg"]);
  assert.equal(o.mock, undefined);
});

test("empty input yields empty positionalArgs", () => {
  const o = parseRunFlags([]);
  assert.deepEqual(o.positionalArgs, []);
  assert.equal(o.config, undefined);
  assert.equal(o.workspace, undefined);
  assert.equal(o.mock, undefined);
});