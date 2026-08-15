import { KeychainCredentialStore } from "./keychain.ts";
import { createCliApprover, type CliApproverIO } from "./approver-cli.ts";
import { readHidden } from "./hidden-input.ts";
import { defaultConfig, loadConfig } from "../config/config.ts";
import { OpenAILLMClient } from "../llm/openai-llm.ts";
import { MockLLMClient } from "../llm/mock-llm.ts";
import { GuardrailPipeline } from "../guardrail/guardrail.ts";
import { SandboxExecutor } from "../guardrail/sandbox.ts";
import { MemoryStore } from "../memory/memory.ts";
import { makeExecutor } from "../tools/executor.ts";
import { AgentLoop } from "../loop/agent-loop.ts";
import { parseVerdict } from "../feedback/verdict-parser.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

const USAGE = `rampart <command> [options]

命令:
  run <task>          在治理护栏内运行编码 agent（需要一个 LLM key）
  setup               安全录入 LLM API key（macOS Keychain）
  status              查看 key 是否已配置（不回显明文）
  clear               从 Keychain 删除 key
  help                显示帮助

选项:
  -c, --config <path>  配置文件路径（默认 当前目录/harness.config.json）
  -w, --workspace <dir> 工作区目录
      --llm-model <m>  覆盖模型
      --mock          使用内置 Mock LLM（离线演示用）
`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "help":
    case "--help":
    case undefined:
    case "":
      console.log(USAGE);
      return 0;
    case "setup":
      return setupCmd();
    case "status":
      return statusCmd();
    case "clear":
      return clearCmd();
    case "run":
      return runCmd(rest);
    default:
      console.error(`未知命令: ${cmd}`);
      console.error(USAGE);
      return 1;
  }
}

async function setupCmd(): Promise<number> {
  const key = await readHidden("请输入 LLM API key（输入不回显）: ");
  if (!key) { console.error("key 不能为空"); return 1; }
  await new KeychainCredentialStore().save(key);
  console.log("已安全保存到 macOS Keychain。");
  return 0;
}

async function statusCmd(): Promise<number> {
  const store = new KeychainCredentialStore();
  const has = await store.hasKey();
  console.log(has ? "状态: 已配置 LLM key（Keychain 中）" : "状态: 未配置 LLM key（运行 `rampart setup` 录入）");
  return 0;
}

async function clearCmd(): Promise<number> {
  await new KeychainCredentialStore().clear();
  console.log("已从 Keychain 清除 key。");
  return 0;
}

async function runCmd(args: string[]): Promise<number> {
  const task = args.find((a) => !a.startsWith("-"));
  const opts = parseRunFlags(args);
  if (!task) { console.error("请提供任务描述，如: rampart run \"修复 src/a.ts 类型错误\""); return 1; }

  let config;
  const cfgPath = opts.config ?? (existsSync(join(process.cwd(), "harness.config.json")) ? join(process.cwd(), "harness.config.json") : undefined);
  if (cfgPath && existsSync(cfgPath)) config = loadConfig(cfgPath);
  else config = defaultConfig(opts.workspace ?? process.cwd());
  if (opts.workspace) config.workspace = opts.workspace;
  if (opts.model) config.llm.model = opts.model;

  let llm;
  if (opts.mock) {
    llm = new MockLLMClient({});
  } else {
    const key = await new KeychainCredentialStore().load();
    if (!key) { console.error("未找到 LLM API key。请先运行 `rampart setup` 安全录入。"); return 1; }
    llm = new OpenAILLMClient({ apiKey: key, baseURL: config.llm.baseURL, model: config.llm.model });
  }

  const memory = new MemoryStore(join(config.workspace, config.memory.sessionFile));
  const sandbox = new SandboxExecutor({ workspace: config.workspace, pathAllowlist: config.guardrail.pathAllowlist, defaultTimeoutMs: config.loop.actionTimeoutMs });
  const guardrail = new GuardrailPipeline(config.workspace, config);
  const execute = makeExecutor({ workspace: config.workspace, sandbox, memory, testCommand: config.feedback.testCommand });
  const approver = createCliApprover({ stdin: process.stdin, stdout: process.stderr } as CliApproverIO);
  const loop = new AgentLoop({
    llm, guardrail, approver, execute, memory, config,
    feedbackSignal: (r) => parseVerdict({ exitCode: r.exitCode ?? null, stdout: r.output, stderr: "" }, config.feedback.successPattern ? new RegExp(config.feedback.successPattern) : undefined),
    onObservation: (o) => {
      console.log(`[step ${o.step}] ${o.action.kind}${o.verdict ? ` verdict=${o.verdict.kind}` : ""}${o.feedback ? ` feedback=${o.feedback}` : ""}`);
    },
  });

  const result = await loop.run(task);
  console.log(`\n完成: status=${result.status}, steps=${result.steps}, reason=${result.reason}`);
  return result.status === "error" ? 1 : 0;
}

function parseRunFlags(args: string[]): { config?: string; workspace?: string; model?: string; mock?: boolean } {
  const out: { config?: string; workspace?: string; model?: string; mock?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-c" || a === "--config") out.config = args[++i];
    if (a === "-w" || a === "--workspace") out.workspace = args[++i];
    if (a === "--llm-model") out.model = args[++i];
    if (a === "--mock") out.mock = true;
  }
  return out;
}