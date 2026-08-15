import test from "node:test";
import assert from "node:assert/strict";
import { KeychainCredentialStore } from "./keychain.ts";

function makeFake(results: Array<{ code: number; stdout: string; stderr: string }>) {
  const calls: string[][] = [];
  const exec = async (args: string[]) => {
    calls.push(args);
    return results.shift() ?? { code: 1, stdout: "", stderr: "no more results" };
  };
  return { calls, exec };
}

test("save invokes security add-generic-password with key", async () => {
  const { calls, exec } = makeFake([{ code: 0, stdout: "", stderr: "" }]);
  const store = new KeychainCredentialStore({ service: "rampart-test", account: "llm", exec });
  await store.save("abc123");
  assert.ok(calls.length === 1);
  assert.ok(calls[0].some((a) => a === "add-generic-password"));
  assert.ok(calls[0].some((a) => a === "abc123"));
});

test("load returns key from security, does not echo into logs", async () => {
  const { exec } = makeFake([{ code: 0, stdout: "secret-key\n", stderr: "" }]);
  const store = new KeychainCredentialStore({ service: "rampart-test", account: "llm", exec });
  const key = await store.load();
  assert.equal(key, "secret-key");
});

test("load returns null when not found", async () => {
  const { exec } = makeFake([{ code: 44, stdout: "", stderr: "not found" }]);
  const store = new KeychainCredentialStore({ service: "rampart-test", account: "llm", exec });
  assert.equal(await store.load(), null);
});

test("hasKey reflects presence", async () => {
  const { exec } = makeFake([{ code: 0, stdout: "k\n", stderr: "" }]);
  const store = new KeychainCredentialStore({ service: "rampart-test", account: "llm", exec });
  assert.equal(await store.hasKey(), true);
});

test("clear deletes keychain entry", async () => {
  const { calls, exec } = makeFake([{ code: 0, stdout: "", stderr: "" }]);
  const store = new KeychainCredentialStore({ service: "rampart-test", account: "llm", exec });
  await store.clear();
  assert.ok(calls[0].some((a) => a === "delete-generic-password"));
});