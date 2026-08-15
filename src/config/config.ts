import { readFileSync } from "node:fs";
import type { ActionKind } from "../actions/types.ts";

export class ConfigError extends Error {}

export interface CommandRule { id: string; tokens: string[] }

export interface GuardrailConfig {
  deny: CommandRule[];
  approve: CommandRule[];
  allow: CommandRule[];
  pathAllowlist: string[];
  defaultPolicyForSpawn: "allow" | "deny";
  approveTimeoutMs: number;
}

export interface LoopConfig {
  maxSteps: number;
  actionTimeoutMs: number;
  sessionTimeoutMs: number;
}

export interface FeedbackConfig {
  testCommand: string;
  successPattern?: string;
}

export interface MemoryConfig {
  sessionFile: string;
  memoryFile: string;
  maxContextEntries: number;
}

export interface LLMConfig {
  provider: "openai";
  baseURL: string;
  model: string;
  timeoutMs: number;
}

export interface ToolsConfig { enabled: ActionKind[] }

export interface HarnessConfig {
  workspace: string;
  llm: LLMConfig;
  tools: ToolsConfig;
  guardrail: GuardrailConfig;
  loop: LoopConfig;
  feedback: FeedbackConfig;
  memory: MemoryConfig;
}

export function defaultConfig(workspace: string): HarnessConfig {
  return {
    workspace,
    llm: { provider: "openai", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini", timeoutMs: 60_000 },
    tools: { enabled: ["read_file", "write_file", "list_dir", "run_command", "run_tests", "note", "stop"] },
    guardrail: {
      deny: [
        { id: "rm-rf", tokens: ["rm", "-rf"] },
        { id: "sudo", tokens: ["sudo"] },
        { id: "mkfs", tokens: ["mkfs"] },
        { id: "dd-block", tokens: ["dd", "of=/dev"] },
        { id: "shutdown", tokens: ["shutdown"] },
      ],
      approve: [
        { id: "git-push-force", tokens: ["git", "push", "--force"] },
        { id: "npm-publish", tokens: ["npm", "publish"] },
      ],
      allow: [
        { id: "git-push", tokens: ["git", "push"] },
        { id: "npm-test", tokens: ["npm", "test"] },
        { id: "node-test", tokens: ["node", "--test"] },
        { id: "ls", tokens: ["ls"] },
        { id: "cat", tokens: ["cat"] },
      ],
      pathAllowlist: [workspace, "/usr/bin", "/bin", "/usr/local/bin", "/opt/homebrew/bin"],
      defaultPolicyForSpawn: "deny",
      approveTimeoutMs: 30_000,
    },
    loop: { maxSteps: 10, actionTimeoutMs: 15_000, sessionTimeoutMs: 300_000 },
    feedback: { testCommand: "npm test", successPattern: "passing" },
    memory: { sessionFile: ".session.json", memoryFile: "memory.json", maxContextEntries: 5 },
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  return {};
}

function pickInt(partial: Record<string, unknown>, key: string, fallback: number, min: number): number {
  const v = partial[key];
  if (v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < min) throw new ConfigError(`config.${key} 必须为 >=${min} 的数`);
  return n;
}

function pickString(partial: Record<string, unknown>, key: string, fallback: string): string {
  const v = partial[key];
  if (v === undefined) return fallback;
  if (typeof v !== "string") throw new ConfigError(`config.${key} 必须为字符串`);
  return v;
}

function pickRuleList(partial: Record<string, unknown>, key: string, fallback: CommandRule[]): CommandRule[] {
  const v = partial[key];
  if (v === undefined) return fallback;
  if (!Array.isArray(v)) throw new ConfigError(`config.guardrail.${key} 必须为数组`);
  return v.map((r, i) => {
    const rr = asRecord(r);
    const tokens = rr.tokens;
    if (!Array.isArray(tokens) || tokens.length === 0) throw new ConfigError(`guardrail.${key}[${i}] 需非空 tokens`);
    return { id: pickString(rr, "id", `${key}-${i}`), tokens: tokens.map(String) };
  });
}

export function validateConfig(raw: unknown, workspace: string): HarnessConfig {
  if (!workspace) throw new ConfigError("workspace 不能为空");
  const base = defaultConfig(workspace);
  const cfg = asRecord(raw);
  const loop = asRecord(cfg.loop);
  const guardrail = asRecord(cfg.guardrail);
  const llm = asRecord(cfg.llm);
  const feedback = asRecord(cfg.feedback);
  return {
    workspace,
    llm: {
      provider: "openai",
      baseURL: pickString(llm, "baseURL", base.llm.baseURL),
      model: pickString(llm, "model", base.llm.model),
      timeoutMs: pickInt(llm, "timeoutMs", base.llm.timeoutMs, 1),
    },
    tools: base.tools,
    guardrail: {
      deny: pickRuleList(guardrail, "deny", base.guardrail.deny),
      approve: pickRuleList(guardrail, "approve", base.guardrail.approve),
      allow: pickRuleList(guardrail, "allow", base.guardrail.allow),
      pathAllowlist: Array.isArray(guardrail.pathAllowlist) ? (guardrail.pathAllowlist as unknown[]).map(String) : base.guardrail.pathAllowlist,
      defaultPolicyForSpawn: guardrail.defaultPolicyForSpawn === "allow" ? "allow" : "deny",
      approveTimeoutMs: pickInt(guardrail, "approveTimeoutMs", base.guardrail.approveTimeoutMs, 1),
    },
    loop: {
      maxSteps: pickInt(loop, "maxSteps", base.loop.maxSteps, 1),
      actionTimeoutMs: pickInt(loop, "actionTimeoutMs", base.loop.actionTimeoutMs, 1),
      sessionTimeoutMs: pickInt(loop, "sessionTimeoutMs", base.loop.sessionTimeoutMs, 1),
    },
    feedback: {
      testCommand: pickString(feedback, "testCommand", base.feedback.testCommand),
      successPattern: feedback.successPattern === undefined ? base.feedback.successPattern : String(feedback.successPattern),
    },
    memory: { ...base.memory },
  };
}

export function loadConfig(path: string): HarnessConfig {
  const text = readFileSync(path, "utf8");
  const raw = JSON.parse(text) as unknown;
  const c = asRecord(raw);
  const workspace = pickString(c, "workspace", process.cwd());
  return validateConfig(raw, workspace);
}