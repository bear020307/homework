import test from "node:test";
import assert from "node:assert/strict";
import { MockLLMClient } from "./mock-llm.ts";
import { OpenAILLMClient } from "./openai-llm.ts";

test("MockLLMClient returns scripted replies in order", async () => {
  const llm = new MockLLMClient({ replies: ["first", "second", "third"] });
  assert.equal((await llm.send([])).content, "first");
  assert.equal((await llm.send([])).content, "second");
  assert.equal((await llm.send([])).content, "third");
});

test("MockLLMClient beyond script length repeats last reply", async () => {
  const llm = new MockLLMClient({ replies: ["only"] });
  assert.equal((await llm.send([])).content, "only");
  assert.equal((await llm.send([])).content, "only");
});

test("MockLLMClient respond callback receives messages", async () => {
  const seen: string[] = [];
  const llm = new MockLLMClient({ respond: (msgs) => { seen.push(msgs.map((m) => m.content).join("|")); return "reply"; } });
  await llm.send([{ role: "user", content: "hello" }]);
  assert.ok(seen[0].includes("hello"));
});

test("MockLLMClient send with empty script returns empty content", async () => {
  const llm = new MockLLMClient({});
  assert.equal((await llm.send([])).content, "");
});

test("OpenAILLMClient is constructable without network", () => {
  const llm = new OpenAILLMClient({ apiKey: "test-key-not-real", model: "gpt-4o-mini" });
  assert.ok(llm);
});