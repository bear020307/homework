import type { LLMClient } from "../llm/llm-client.ts";
import type { LLMMessage } from "../llm/llm-client.ts";
import { parseResponse } from "../actions/parse.ts";
import type { Action } from "../actions/types.ts";
import type { GuardrailPipeline, Verdict } from "../guardrail/guardrail.ts";
import type { Approver } from "../guardrail/hitl.ts";
import { HITLState } from "../guardrail/hitl.ts";
import type { MemoryStore } from "../memory/memory.ts";
import type { HarnessConfig } from "../config/config.ts";
import type { ToolResult } from "../tools/executor.ts";
import type { VerdictSignal } from "../feedback/verdict-parser.ts";

export interface Observation {
  step: number;
  action: Action;
  verdict?: Verdict;
  result?: ToolResult;
  feedback?: VerdictSignal;
  status?: "executed" | "blocked" | "denied" | "rejected" | "approval_expired";
}

export interface SessionResult {
  status: "done" | "max_steps" | "error";
  reason: string;
  steps: number;
  observations: Observation[];
}

export interface AgentLoopOptions {
  llm: LLMClient;
  guardrail: GuardrailPipeline;
  approver: Approver;
  execute: (a: Action) => Promise<ToolResult>;
  memory: MemoryStore;
  config: HarnessConfig;
  feedbackSignal?: (r: ToolResult) => VerdictSignal | undefined;
  onObservation?: (o: Observation) => void;
}

export class AgentLoop {
  private opts: AgentLoopOptions;
  constructor(opts: AgentLoopOptions) {
    this.opts = opts;
  }

  async run(task: string): Promise<SessionResult> {
    const observations: Observation[] = [];
    const { config } = this.opts;
    const start = Date.now();
    let lastFeedback: VerdictSignal | undefined;
    let lastResultText = "";
    let lastVerdictText = "";

    for (let step = 1; step <= config.loop.maxSteps; step++) {
      if (Date.now() - start > config.loop.sessionTimeoutMs) {
        return { status: "error", reason: "session timeout", steps: step - 1, observations };
      }
      const messages = this.buildContext(task, observations, lastFeedback, lastResultText, lastVerdictText);
      let content: string;
      try {
        content = (await this.opts.llm.send(messages, { timeoutMs: config.llm.timeoutMs })).content;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.push(observations, step, { id: `err${step}`, kind: "malformed", raw: msg });
        lastResultText = `LLM 调用失败: ${msg}`;
        continue;
      }
      const action = parseResponse(content);
      const verdict = await this.opts.guardrail.evaluate(action);

      switch (verdict.kind) {
        case "block":
          this.push(observations, step, action, verdict, undefined, "blocked");
          continue;
        case "deny":
          this.push(observations, step, action, verdict, undefined, "denied");
          continue;
        case "approve": {
          const hitl = new HITLState(config.guardrail.approveTimeoutMs);
          const res = await hitl.run(this.opts.approver, action, verdict);
          if (res !== "approved") {
            this.push(observations, step, action, verdict, undefined, res === "expired" ? "approval_expired" : "rejected");
            continue;
          }
          break;
        }
        case "allow":
          break;
      }

      const result = await this.opts.execute(action);
      let feedback: VerdictSignal | undefined;
      if (action.kind === "run_tests" && this.opts.feedbackSignal) {
        feedback = this.opts.feedbackSignal(result);
      }
      this.push(observations, step, action, verdict, result, "executed", feedback);

      if (action.kind === "stop") {
        return {
          status: "done",
          reason: action.reason ?? "stop action",
          steps: step,
          observations,
        };
      }
      lastFeedback = feedback;
      lastResultText = result.output;
      lastVerdictText = verdict.kind;
    }
    return { status: "max_steps", reason: `达到步数上限 ${config.loop.maxSteps}`, steps: config.loop.maxSteps, observations };
  }

  private push(
    observations: Observation[],
    step: number,
    action: Action,
    verdict?: Verdict,
    result?: ToolResult,
    status?: Observation["status"],
    feedback?: VerdictSignal,
  ): void {
    const o: Observation = { step, action, verdict, result, feedback, status };
    observations.push(o);
    this.opts.onObservation?.(o);
  }

  private buildContext(task: string, observations: Observation[], lastFeedback?: VerdictSignal, lastResultText = "", lastVerdictText = ""): LLMMessage[] {
    const { config } = this.opts;
    const messages: LLMMessage[] = [];
    messages.push({ role: "system", content: buildSystemPrompt(config) });
    messages.push({ role: "user", content: `任务：${task}` });
    if (observations.length > 0) {
      const recent = observations.slice(-5);
      const lines = recent.map((o) => {
        const v = o.verdict ? `verdict=${o.verdict.kind}` : "";
        const fb = o.feedback ? `, feedback=${o.feedback}` : "";
        const st = o.status ? `, status=${o.status}` : "";
        return `- step ${o.step}: ${o.action.kind} ${v}${fb}${st}${o.result ? `\n  result: ${truncate(o.result.output, 300)}` : ""}`;
      });
      messages.push({ role: "assistant", content: `【前序观测】\n${lines.join("\n")}` });
      if (lastFeedback) messages.push({ role: "system", content: `【最新反馈】${lastFeedback}` });
    } else {
      messages.push({ role: "assistant", content: "【暂无前序观测】" });
    }
    return messages;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function buildSystemPrompt(config: HarnessConfig): string {
  return [
    "你是一个运行在治理护栏内的编码 agent。",
    `工作区：${config.workspace}`,
    "可用工具（JSON 或文本协议）：read_file / write_file / list_dir / run_command / run_tests / note / stop。",
    "输出必须是单个动作。危险/未列入白名单的命令会被护栏拦截或需要人工审批。",
    "完成时输出 stop 动作。",
  ].join("\n");
}