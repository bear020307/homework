import { createInterface } from "node:readline";
import type { Approver, ApprovalResult } from "../guardrail/hitl.ts";
import type { Action } from "../actions/types.ts";
import type { Verdict } from "../guardrail/guardrail.ts";

export interface CliApproverIO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
}

export function createCliApprover(io: CliApproverIO): Approver {
  return {
    requestApproval(action: Action, verdict: Verdict): Promise<ApprovalResult> {
      return new Promise((resolve) => {
        const rl = createInterface({ input: io.stdin, output: io.stdout });
        io.stdout.write(`\n[护栏] ${verdict.reason}\n`);
        io.stdout.write(`  动作: ${action.kind}\n`);
        if (action.kind === "run_command") io.stdout.write(`  命令: ${(action as { command?: string }).command}\n`);
        rl.question("允许执行？(y=允许 / n=拒绝 / !s=允许并记住本会话): ", (ans) => {
          rl.close();
          const a = ans.trim();
          if (a === "y" || a === "!s") resolve("approved");
          else resolve("rejected");
        });
      });
    },
  };
}