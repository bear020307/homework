import type { Action } from "../actions/types.ts";
import type { Verdict } from "./guardrail.ts";

export type ApprovalResult = "approved" | "rejected" | "expired";

export interface Approver {
  requestApproval(action: Action, verdict: Verdict): Promise<ApprovalResult>;
}

export class InMemoryApprover implements Approver {
  private queue: ApprovalResult[] = [];
  queueResult(r: ApprovalResult): void { this.queue.push(r); }
  async requestApproval(_action: Action, _verdict: Verdict): Promise<ApprovalResult> {
    return this.queue.shift() ?? "rejected";
  }
}

export type HITLStatus = "idle" | "pending" | "approved" | "rejected" | "expired";

export class HITLState {
  current: HITLStatus = "idle";
  private timeoutMs: number;
  constructor(timeoutMs: number) {
    this.timeoutMs = timeoutMs;
  }

  async run(approver: Approver, action: Action, verdict: Verdict): Promise<ApprovalResult> {
    this.current = "pending";
    let timer: NodeJS.Timeout | undefined;
    const approval = approver.requestApproval(action, verdict);
    const timeout = new Promise<"expired">((resolve) => {
      timer = setTimeout(() => resolve("expired"), this.timeoutMs);
    });
    const result = await Promise.race([approval, timeout]);
    if (timer) clearTimeout(timer);
    this.current = result;
    return result;
  }
}