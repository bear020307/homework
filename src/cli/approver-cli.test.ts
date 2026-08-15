import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { createCliApprover } from "./approver-cli.ts";
import type { Action } from "../actions/types.ts";
import type { Verdict } from "../guardrail/guardrail.ts";

async function runApprover(input: string) {
  const stdout = new Writable({ write(_c, _e, cb) { cb(); } });
  const stdin = Readable.from([input]);
  const ap = createCliApprover({ stdin, stdout });
  const action: Action = { id: "a", kind: "run_command", command: "git push" };
  const verdict: Verdict = { kind: "approve", reason: "needs approval", ruleId: "git-push" };
  return ap.requestApproval(action, verdict);
}

test("y approves, n rejects, !s approves", async () => {
  assert.equal(await runApprover("y\n"), "approved");
  assert.equal(await runApprover("n\n"), "rejected");
  assert.equal(await runApprover("!s\n"), "approved");
});