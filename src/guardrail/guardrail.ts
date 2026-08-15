import { resolveInsideWorkspace } from "./path-fence.ts";
import { tokenizeShell, normalizeTokens } from "./shell.ts";
import { matchRule } from "./rules.ts";
import type { HarnessConfig } from "../config/config.ts";
import type { Action } from "../actions/types.ts";

export type VerdictKind = "allow" | "deny" | "approve" | "block";
export interface Verdict {
  kind: VerdictKind;
  reason: string;
  ruleId?: string;
}

const block = (reason: string, ruleId?: string): Verdict => ({ kind: "block", reason, ruleId });
const approveV = (reason: string, ruleId?: string): Verdict => ({ kind: "approve", reason, ruleId });
const allow = (reason: string): Verdict => ({ kind: "allow", reason });
const denyV = (reason: string): Verdict => ({ kind: "deny", reason });

type PathAction = Extract<Action, { kind: "read_file" | "write_file" | "list_dir" }>;
type CommandAction = Extract<Action, { kind: "run_command" | "run_tests" }>;

export class GuardrailPipeline {
  private workspace: string;
  private config: HarnessConfig["guardrail"];

  constructor(workspace: string, config: HarnessConfig) {
    this.workspace = workspace;
    this.config = config.guardrail;
  }

  async evaluate(action: Action): Promise<Verdict> {
    switch (action.kind) {
      case "read_file":
      case "write_file":
      case "list_dir":
        return this.evaluatePath(action);
      case "run_command":
      case "run_tests":
        return this.evaluateCommand(action);
      default:
        return allow("note/stop/malformed 不受护栏限制");
    }
  }

  private evaluatePath(action: PathAction): Verdict {
    if (resolveInsideWorkspace(action.path, this.workspace)) {
      return allow("路径位于工作区内");
    }
    return block("路径越出工作区", "scope-fence");
  }

  private evaluateCommand(action: CommandAction): Verdict {
    if (action.kind === "run_tests" && !action.command) {
      return allow("run_tests（使用受控反馈命令）");
    }
    const command = action.command ?? "";
    const tokens = tokenizeShell(command);
    const keyTokens = normalizeTokens(tokens);
    const denyHit = matchRule(keyTokens, this.config.deny);
    if (denyHit) return block(`危险命令被拦截: ${denyHit.id}`, denyHit.id);
    const approveHit = matchRule(keyTokens, this.config.approve);
    if (approveHit) return approveV(`需人工审批: ${approveHit.id}`, approveHit.id);
    const allowHit = matchRule(keyTokens, this.config.allow);
    if (allowHit) return allow(`命令已列入白名单: ${allowHit.id}`);
    if (this.config.defaultPolicyForSpawn === "deny") {
      return denyV("命令未列入白名单，默认拒绝");
    }
    return allow("默认放行（allow policy）");
  }
}