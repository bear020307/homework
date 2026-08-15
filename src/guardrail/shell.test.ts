import test from "node:test";
import assert from "node:assert/strict";
import { tokenizeShell } from "./shell.ts";
import { matchRule, type CommandRule } from "./rules.ts";

test("tokenizeShell handles flags and args", () => {
  assert.deepEqual(tokenizeShell("rm -rf /"), ["rm", "-rf", "/"]);
  assert.deepEqual(tokenizeShell("rm file.log"), ["rm", "file.log"]);
});

test("tokenizeShell keeps quoted args together", () => {
  assert.deepEqual(tokenizeShell('npm test -- --grep "hello world"'), ["npm", "test", "--", "--grep", "hello world"]);
});

test("tokenizeShell splits pipes and operators", () => {
  assert.deepEqual(tokenizeShell("cat a | grep x"), ["cat", "a", "grep", "x"]);
  assert.deepEqual(tokenizeShell("git push --force"), ["git", "push", "--force"]);
});

test("tokenizeShell handling of redirection drops operators", () => {
  assert.deepEqual(tokenizeShell("ls > out.txt"), ["ls", "out.txt"]);
});

test("matchRule finds contiguous subsequence", () => {
  const rules: CommandRule[] = [{ id: "rm-rf", tokens: ["rm", "-rf"] }];
  assert.equal(matchRule(["rm", "-rf", "/"], rules)?.id, "rm-rf");
  assert.equal(matchRule(["sudo", "rm", "-rf", "/"], rules)?.id, "rm-rf");
});

test("matchRule does not match non-contiguous tokens", () => {
  const rules: CommandRule[] = [{ id: "rm-rf", tokens: ["rm", "-rf"] }];
  assert.equal(matchRule(["rm", "file1", "-rf", "file2"], rules), null);
});

test("matchRule no match when absent", () => {
  const rules: CommandRule[] = [{ id: "rm-rf", tokens: ["rm", "-rf"] }];
  assert.equal(matchRule(["ls"], rules), null);
});

test("matchRule returns first matching rule", () => {
  const rules: CommandRule[] = [
    { id: "rm-rf", tokens: ["rm", "-rf"] },
    { id: "rm", tokens: ["rm"] },
  ];
  assert.equal(matchRule(["rm", "-rf", "/"], rules)?.id, "rm-rf");
});