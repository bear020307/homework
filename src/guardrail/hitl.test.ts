import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryApprover, HITLState, type Approver, type ApprovalResult } from "./hitl.ts";
import type { Action } from "../actions/types.ts";
import type { Verdict } from "./guardrail.ts";

const action: Action = { id: "a1", kind: "run_command", command: "git push --force" };
const verdict: Verdict = { kind: "approve", reason: "needs approval", ruleId: "git-push-force" };

let longTimer: NodeJS.Timeout | undefined;
class StallingApprover implements Approver {
  requestApproval(): Promise<ApprovalResult> {
    return new Promise<ApprovalResult>((resolve) => {
      longTimer = setTimeout(() => resolve("approved"), 60_000);
    });
  }
}
function clearStall(): void {
  if (longTimer) { clearTimeout(longTimer); longTimer = undefined; }
}

test("InMemoryApprover replays queued results", async () => {
  const ap = new InMemoryApprover();
  ap.queueResult("approved");
  ap.queueResult("rejected");
  assert.equal(await ap.requestApproval(action, verdict), "approved");
  assert.equal(await ap.requestApproval(action, verdict), "rejected");
});

test("InMemoryApprover defaults to rejected when queue empty", async () => {
  const ap = new InMemoryApprover();
  assert.equal(await ap.requestApproval(action, verdict), "rejected");
});

test("HITLState approves and transitions", async () => {
  const ap = new InMemoryApprover();
  ap.queueResult("approved");
  const state = new HITLState(1000);
  const r = await state.run(ap, action, verdict);
  assert.equal(r, "approved");
  assert.equal(state.current, "approved");
});

test("HITLState rejects and transitions", async () => {
  const ap = new InMemoryApprover();
  ap.queueResult("rejected");
  const state = new HITLState(1000);
  const r = await state.run(ap, action, verdict);
  assert.equal(r, "rejected");
  assert.equal(state.current, "rejected");
});

test("HITLState expires on timeout", async () => {
  const ap = new StallingApprover();
  const state = new HITLState(20);
  try {
    const r = await state.run(ap, action, verdict);
    assert.equal(r, "expired");
    assert.equal(state.current, "expired");
  } finally {
    clearStall();
  }
});