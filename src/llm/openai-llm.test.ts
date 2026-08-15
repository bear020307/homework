import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAILLMClient } from "./openai-llm.ts";

const originalFetch = globalThis.fetch;

function stubFetch(handler: (input: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = handler as typeof fetch;
  test.after(() => { globalThis.fetch = originalFetch; });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("builds chat completions URL stripping trailing slash from baseURL", async () => {
  let url = "";
  stubFetch(async (input) => {
    url = input;
    return jsonResponse({ choices: [{ message: { content: "hi" } }] });
  });
  const llm = new OpenAILLMClient({ apiKey: "k", baseURL: "https://api.example.com/v1/", model: "m" });
  await llm.send([{ role: "user", content: "x" }]);
  assert.equal(url, "https://api.example.com/v1/chat/completions");
});

test("defaults baseURL to api.openai.com when omitted", async () => {
  let url = "";
  stubFetch(async (input) => {
    url = input;
    return jsonResponse({ choices: [] });
  });
  const llm = new OpenAILLMClient({ apiKey: "k", model: "m" });
  await llm.send([{ role: "user", content: "x" }]);
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
});

test("sends Authorization Bearer header with the apiKey", async () => {
  let auth = "";
  stubFetch(async (_input, init) => {
    auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
    return jsonResponse({ choices: [] });
  });
  const llm = new OpenAILLMClient({ apiKey: "secret-key", baseURL: "https://api.example.com/v1", model: "m" });
  await llm.send([{ role: "user", content: "x" }]);
  assert.equal(auth, "Bearer secret-key");
});

test("sends model and messages in request body", async () => {
  let body = "";
  stubFetch(async (_input, init) => {
    body = String(init?.body);
    return jsonResponse({ choices: [] });
  });
  const llm = new OpenAILLMClient({ apiKey: "k", baseURL: "https://api.example.com/v1", model: "gpt-test" });
  await llm.send([{ role: "user", content: "hello" }]);
  const parsed = JSON.parse(body) as { model: string; messages: unknown[] };
  assert.equal(parsed.model, "gpt-test");
  assert.deepEqual(parsed.messages, [{ role: "user", content: "hello" }]);
});

test("throws LLM HTTP error on non-ok response with truncated body", async () => {
  stubFetch(async () => new Response("boom error details here", { status: 429 }));
  const llm = new OpenAILLMClient({ apiKey: "k", baseURL: "https://api.example.com/v1", model: "m" });
  await assert.rejects(
    () => llm.send([{ role: "user", content: "x" }]),
    /LLM HTTP 429: boom error/
  );
});

test("returns first choice content", async () => {
  stubFetch(async () => jsonResponse({ choices: [{ message: { content: "answer" } }] }));
  const llm = new OpenAILLMClient({ apiKey: "k", baseURL: "https://api.example.com/v1", model: "m" });
  const r = await llm.send([{ role: "user", content: "x" }]);
  assert.equal(r.content, "answer");
});

test("returns empty content when choices is empty", async () => {
  stubFetch(async () => jsonResponse({ choices: [] }));
  const llm = new OpenAILLMClient({ apiKey: "k", baseURL: "https://api.example.com/v1", model: "m" });
  const r = await llm.send([{ role: "user", content: "x" }]);
  assert.equal(r.content, "");
});

test("aborts the request when timeout elapses", async () => {
  stubFetch(async (_input, init) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  });
  const llm = new OpenAILLMClient({ apiKey: "k", baseURL: "https://api.example.com/v1", model: "m" });
  await assert.rejects(
    () => llm.send([{ role: "user", content: "x" }], { timeoutMs: 10 }),
    /Aborted/
  );
});