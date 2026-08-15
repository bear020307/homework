import test from "node:test";
import assert from "node:assert/strict";
import { parseResponse } from "./parse.ts";
import type { Action } from "./types.ts";

test("parses read_file JSON", () => {
  const a = parseResponse('{"tool":"read_file","path":"src/a.ts"}');
  assert.equal(a.kind, "read_file");
  if (a.kind === "read_file") assert.equal(a.path, "src/a.ts");
  assert.ok(a.id);
});

test("parses write_file JSON with content", () => {
  const a = parseResponse('{"tool":"write_file","path":"src/b.ts","content":"export const x = 1;"}');
  assert.equal(a.kind, "write_file");
  if (a.kind === "write_file") assert.equal(a.content, "export const x = 1;");
});

test("parses run_command JSON with timeout", () => {
  const a = parseResponse('{"tool":"run_command","command":"npm test","timeout":5000}');
  assert.equal(a.kind, "run_command");
  if (a.kind === "run_command") { assert.equal(a.command, "npm test"); assert.equal(a.timeout, 5000); }
});

test("parses run_tests JSON with optional command", () => {
  const a = parseResponse('{"tool":"run_tests","command":"npm test"}');
  assert.equal(a.kind, "run_tests");
});

test("parses note JSON with tags", () => {
  const a = parseResponse('{"tool":"note","text":"use strict","tags":["convention"]}');
  assert.equal(a.kind, "note");
  if (a.kind === "note") assert.deepEqual(a.tags, ["convention"]);
});

test("parses stop JSON variants (done/finished/complete)", () => {
  for (const s of ['{"tool":"stop"}', '{"tool":"done","answer":"x"}', '{"action":"finished"}', '{"status":"complete"}']) {
    const a = parseResponse(s);
    assert.equal(a.kind, "stop", `should stop for ${s}`);
  }
});

test("parses text protocol", () => {
  assert.equal(parseResponse('read_file("src/a.ts")').kind, "read_file");
  assert.equal(parseResponse('run_command("npm test")').kind, "run_command");
  assert.equal(parseResponse('note("remember strict mode")').kind, "note");
  assert.equal(parseResponse('stop("all done")').kind, "stop");
  assert.equal(parseResponse("run_tests()").kind, "run_tests");
});

test("malformed input yields malformed action, never throws", () => {
  const a = parseResponse("this is not an action at all");
  assert.equal(a.kind, "malformed");
  const b = parseResponse("");
  assert.equal(b.kind, "malformed");
  const c = parseResponse('{"tool":"unknown_tool"}');
  assert.equal(c.kind, "malformed");
});