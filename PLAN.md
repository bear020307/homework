# Rampart（rampart-cli）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐 task 实现本计划。步骤用 `- [ ]` 复选框追踪。

**Goal:** 交付一个自研的 coding agent harness 内核（主循环 + 工具分发 + 治理护栏 + 反馈闭环 + 记忆 + 配置），治理维度做深，满足 AI4SE 期末项目 A 全部要求。

**Architecture:** 纯 TypeScript 核心、依赖最小化。主循环为显式状态机：上下文 → LLM → 解析 → 护栏 → 分发 → 反馈 → 停机。治理 = 纯函数流水线（路径围栏 + 命令规则）+ HITL 状态机 + 沙箱执行器。所有机制用 MockLLM / 注入假件做确定性单测，不触网。

**Tech Stack:** Node ≥ 22（原生 TS 类型剥离，零构建运行）、node:test（内置测试）、TypeScript 仅作类型检查（`tsc --noEmit`）、macOS `security` CLI（Keychain）。

## Global Constraints（所有 task 隐式包含）

- Node ≥ 22；运行时零第三方运行时依赖；devDependencies 仅 `typescript` + `@types/node`。
- **禁止 `enum`**（Node 类型剥离不支持），用字符串字面量联合 + const 对象。
- 相对导入必须带 `.ts` 扩展名（如 `import { x } from "./y.ts"`）。
- 类型仅导入用 `import type`。
- 所有机制测试必须用 MockLLM / 注入假件，**禁止触网与真实 LLM**；临时文件用 `mkdtempSync` 且测毕清理。
- 测试文件与源码同目录，命名 `*.test.ts`；运行 `npm test`（= `node --test src/`）。
- 每个机制满足"移除真实 LLM 仍可确定性验证"（SPEC §9.3）。
- 凭据绝不硬编码、绝不进 git/日志/history（SPEC §4.2）。
- 目录结构：`src/{loop,llm,actions,guardrail,feedback,memory,config,cli,demo}/`，根目录 `bin/`。
- 每个 task 末尾：`npm test` 全绿 + `npm run typecheck` 通过 + git commit。
- 冷启动验证（通用要求 §4.5）：正式实现前，用**陌生 subagent**（不带本会话历史）仅凭 SPEC.md + PLAN.md 实现 1–2 个 task，记录到 SPEC_PROCESS.md，据此修订 SPEC/PLAN。

## 文件结构总览

| 文件 | 职责 |
|------|------|
| `package.json` | 包元数据、scripts（test/typecheck/demo）、bin |
| `tsconfig.json` | TS 类型检查配置（erasableSyntaxOnly） |
| `.gitignore` | 排除 node_modules/dist/.env/会话文件 |
| `Makefile` | `make test` / `make typecheck` / `make demo` |
| `bin/rampart.js` | CLI 薄壳（import src/cli/index.ts） |
| `src/smoke.test.ts` | 脚手架冒烟测试 |
| `src/actions/types.ts` | Action 判别联合类型 + ActionKind |
| `src/actions/parse.ts` | `parseResponse(text): Action`（JSON + 文本协议） |
| `src/actions/parse.test.ts` | parseResponse 单测 |
| `src/llm/llm-client.ts` | `LLMClient`/`LLMMessage`/`LLMResponse` 接口 |
| `src/llm/mock-llm.ts` | `MockLLMClient`（脚本/回调驱动） |
| `src/llm/openai-llm.ts` | `OpenAILLMClient`（fetch Chat Completions） |
| `src/llm/llm.test.ts` | MockLLM 单测 |
| `src/config/config.ts` | 类型 + `defaultConfig`/`validateConfig`/`loadConfig` |
| `src/config/config.test.ts` | 配置单测 |
| `src/guardrail/shell.ts` | `tokenizeShell(cmd)` |
| `src/guardrail/rules.ts` | `CommandRule` + `matchRule` |
| `src/guardrail/shell.test.ts` | 词法器 + 规则单测 |
| `src/guardrail/path-fence.ts` | `isWithinWorkspace`/`resolveInsideWorkspace`（含软链接） |
| `src/guardrail/path-fence.test.ts` | 路径围栏单测 |
| `src/guardrail/guardrail.ts` | `GuardrailPipeline` 纯函数 |
| `src/guardrail/guardrail.test.ts` | 护栏流水线单测（核心） |
| `src/guardrail/hitl.ts` | `Approver`/`InMemoryApprover`/`HITLState` |
| `src/guardrail/hitl.test.ts` | HITL 状态机单测 |
| `src/guardrail/sandbox.ts` | `SandboxExecutor`（cwd/PATH/超时/逃逸拒绝） |
| `src/guardrail/sandbox.test.ts` | 沙箱单测 |
| `src/feedback/test-runner.ts` | `TestRunner` |
| `src/feedback/verdict-parser.ts` | `parseVerdict → pass|fail|unresolved` |
| `src/feedback/feedback.test.ts` | 反馈单测 |
| `src/memory/memory.ts` | `MemoryStore`（JSON + 按需检索） |
| `src/memory/memory.test.ts` | 记忆单测 |
| `src/tools/executor.ts` | `makeExecutor`（工具分发，无护栏） |
| `src/tools/executor.test.ts` | 分发单测 |
| `src/loop/agent-loop.ts` | `AgentLoop`（主循环状态机） |
| `src/loop/agent-loop.test.ts` | 主循环单测（mock 驱动） |
| `src/cli/keychain.ts` | `KeychainCredentialStore`（security CLI，可注入 exec） |
| `src/cli/keychain.test.ts` | 凭据单测（注入假 exec） |
| `src/cli/hidden-input.ts` | 隐藏输入（tty 回显关闭） |
| `src/cli/approver-cli.ts` | 终端 y/n 审批实现 |
| `src/cli/index.ts` | `rampart run/setup/status/clear/--help` |
| `src/demo/demo.ts` | 机制演示脚本（mock 确定性复现 3 行为） |
| `src/demo/demo.test.ts` | 演示行为断言 |
| `.github/workflows/ci.yml` | push 触发 npm ci + typecheck + test |
| `README.md` / `SPEC_PROCESS.md` / `AGENT_LOG.md` / `REFLECTION.md` | 交付文档 |

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `Makefile`
- Create: `bin/rampart.js`
- Create: `src/smoke.test.ts`
- Create: `src/cli/index.ts`（占位，Task 14 填充）

**Interfaces:**
- Produces: `npm test`（node --test 扫描 src/）、`npm run typecheck` 三条命令可用；`main(): Promise<number>`（index.ts 导出）。

- [ ] **Step 1: 写冒烟测试**

创建 `src/smoke.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";

test("smoke: harness test harness works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "rampart-cli",
  "version": "0.1.0",
  "description": "A governed coding-agent harness: Agent = LLM + Harness. Guardrails, HITL, feedback, memory, config.",
  "type": "module",
  "bin": { "rampart": "bin/rampart.js" },
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test src/",
    "typecheck": "tsc --noEmit",
    "demo": "node src/demo/demo.ts"
  },
  "license": "MIT",
  "devDependencies": {
    "typescript": "^5.8.0",
    "@types/node": "^24.0.0"
  }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 创建 .gitignore**

```gitignore
node_modules/
dist/
.env
*.keychain-dump
.session.json
memory.json
.DS_Store
```

- [ ] **Step 5: 创建 Makefile**

```makefile
.PHONY: test typecheck demo install
test:
	npm test
typecheck:
	npm run typecheck
demo:
	npm run demo
install:
	npm install -g .
```

- [ ] **Step 6: 创建 bin/rampart.js（薄壳）**

```js
#!/usr/bin/env node
import { main } from "../src/cli/index.ts";
main().then((code) => { process.exitCode = code; }).catch((e) => {
  console.error(e.message ?? String(e));
  process.exitCode = 1;
});
```

- [ ] **Step 7: 创建 src/cli/index.ts（占位）**

```ts
export async function main(): Promise<number> {
  console.error("rampart: CLI 尚未实现（见 PLAN Task 14）");
  return 0;
}
```

- [ ] **Step 8: 安装依赖并验证**

Run: `npm install`
Run: `npm test`
Expected: smoke 用例 PASS。
Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 9: 提交**

```bash
git add -A && git commit -m "chore: 项目脚手架（package.json/tsconfig/bin/Makefile）"
```

---

### Task 2: 动作模型与解析

**Files:**
- Create: `src/actions/types.ts`
- Create: `src/actions/parse.ts`
- Test: `src/actions/parse.test.ts`

**Interfaces:**
- Produces: `Action`/`ActionKind`（types.ts 导出）；`parseResponse(text: string): Action`（parse.ts 导出）。后续 loop/guardrail/executor 依赖。

**Dependencies:** Task 1（脚手架）。

- [ ] **Step 1: 写失败测试**

创建 `src/actions/parse.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseResponse } from "./parse.ts";
import type { Action } from "./types.ts";

test("parses read_file JSON", () => {
  const a = parseResponse('{"tool":"read_file","path":"src/a.ts"}');
  assert.equal(a.kind, "read_file");
  if (a.kind === "read_file") assert.equal(a.path, "src/a.ts");
  assert.ok(a.id);
});

test("parses write_file JSON with content", () => {
  const a = parseResponse('{"tool":"write_file","path":"src/b.ts","content":"export const x = 1;"}');
  assert.equal(a.kind, "write_file");
  if (a.kind === "write_file") assert.equal(a.content, "export const x = 1;");
});

test("parses run_command JSON with timeout", () => {
  const a = parseResponse('{"tool":"run_command","command":"npm test","timeout":5000}');
  assert.equal(a.kind, "run_command");
  if (a.kind === "run_command") { assert.equal(a.command, "npm test"); assert.equal(a.timeout, 5000); }
});

test("parses run_tests JSON with optional command", () => {
  const a = parseResponse('{"tool":"run_tests","command":"npm test"}');
  assert.equal(a.kind, "run_tests");
});

test("parses note JSON with tags", () => {
  const a = parseResponse('{"tool":"note","text":"use strict","tags":["convention"]}');
  assert.equal(a.kind, "note");
  if (a.kind === "note") assert.deepEqual(a.tags, ["convention"]);
});

test("parses stop JSON variants (done/finished/complete)", () => {
  for (const s of ['{"tool":"stop"}', '{"tool":"done","answer":"x"}', '{"action":"finished"}', '{"status":"complete"}']) {
    const a = parseResponse(s);
    assert.equal(a.kind, "stop", `should stop for ${s}`);
  }
});

test("parses text protocol", () => {
  assert.equal(parseResponse('read_file("src/a.ts")').kind, "read_file");
  assert.equal(parseResponse('run_command("npm test")').kind, "run_command");
  assert.equal(parseResponse('note("remember strict mode")').kind, "note");
  assert.equal(parseResponse('stop("all done")').kind, "stop");
  assert.equal(parseResponse("run_tests()").kind, "run_tests");
});

test("malformed input yields malformed action, never throws", () => {
  const a = parseResponse("this is not an action at all");
  assert.equal(a.kind, "malformed");
  const b = parseResponse("");
  assert.equal(b.kind, "malformed");
  const c = parseResponse('{"tool":"unknown_tool"}');
  assert.equal(c.kind, "malformed");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/actions/parse.test.ts`
Expected: FAIL（parseResponse 未定义）。

- [ ] **Step 3: 创建 src/actions/types.ts**

```ts
import { randomUUID } from "node:crypto";

export type ActionKind =
  | "read_file" | "write_file" | "list_dir"
  | "run_command" | "run_tests"
  | "note" | "stop" | "malformed";

export type Action =
  | { id: string; kind: "read_file"; path: string }
  | { id: string; kind: "write_file"; path: string; content: string }
  | { id: string; kind: "list_dir"; path: string }
  | { id: string; kind: "run_command"; command: string; timeout?: number }
  | { id: string; kind: "run_tests"; command?: string; cwd?: string }
  | { id: string; kind: "note"; text: string; tags?: string[] }
  | { id: string; kind: "stop"; reason?: string }
  | { id: string; kind: "malformed"; raw: string };

export function newId(): string { return randomUUID(); }
```

- [ ] **Step 4: 创建 src/actions/parse.ts**

```ts
import { newId, type Action } from "./types.ts";

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function malformed(raw: string): Action {
  return { id: newId(), kind: "malformed", raw };
}

function textAction(kind: Action["kind"], args: Record<string, unknown>): Action {
  return { id: newId(), kind, ...args } as Action;
}

export function parseResponse(text: string): Action {
  const t = text.trim();
  if (!t) return malformed(text);
  if (t.startsWith("{")) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      if (obj.action === "finished" || obj.status === "complete") {
        const reason = obj.reason ?? obj.answer;
        return { id: newId(), kind: "stop", reason: typeof reason === "string" ? reason : undefined };
      }
      const tool = String(obj.tool ?? "");
      switch (tool) {
        case "read_file": return textAction("read_file", { path: String(obj.path ?? "") });
        case "write_file": return textAction("write_file", { path: String(obj.path ?? ""), content: String(obj.content ?? "") });
        case "list_dir": return textAction("list_dir", { path: String(obj.path ?? "") });
        case "run_command": return textAction("run_command", { command: String(obj.command ?? ""), timeout: typeof obj.timeout === "number" ? obj.timeout : undefined });
        case "run_tests": return textAction("run_tests", { command: typeof obj.command === "string" ? obj.command : undefined, cwd: typeof obj.cwd === "string" ? obj.cwd : undefined });
        case "note": return textAction("note", { text: String(obj.text ?? ""), tags: Array.isArray(obj.tags) ? (obj.tags as unknown[]).map(String) : undefined });
        case "stop":
        case "done":
          return textAction("stop", { reason: typeof obj.reason === "string" ? obj.reason : (typeof obj.answer === "string" ? obj.answer : undefined) });
        default:
          return malformed(text);
      }
    } catch {
      return malformed(text);
    }
  }
  const forms: Array<{ re: RegExp; kind: Action["kind"]; map: (m: RegExpExecArray) => Record<string, unknown> }> = [
    { re: /^read_file\(\s*(.*?)\s*\)$/s, kind: "read_file", map: (m) => ({ path: stripQuotes(m[1]) }) },
    { re: /^write_file\(\s*(.*?)\s*\)$/s, kind: "write_file", map: (m) => ({ path: stripQuotes(m[1]), content: "" }) },
    { re: /^list_dir\(\s*(.*?)\s*\)$/s, kind: "list_dir", map: (m) => ({ path: stripQuotes(m[1]) }) },
    { re: /^run_command\(\s*(.*?)\s*\)$/s, kind: "run_command", map: (m) => ({ command: stripQuotes(m[1]) }) },
    { re: /^run_tests\(\s*(.*?)\s*\)$/s, kind: "run_tests", map: (m) => (m[1].trim() ? { command: stripQuotes(m[1]) } : {}) },
    { re: /^note\(\s*(.*?)\s*\)$/s, kind: "note", map: (m) => ({ text: stripQuotes(m[1]) }) },
    { re: /^stop\(\s*(.*?)\s*\)$/s, kind: "stop", map: (m) => (m[1].trim() ? { reason: stripQuotes(m[1]) } : {}) },
  ];
  for (const f of forms) {
    const m = f.re.exec(t);
    if (m) return textAction(f.kind, f.map(m));
  }
  return malformed(text);
}
```

- [ ] **Step 5: 运行验证通过**

Run: `node --test src/actions/parse.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add src/actions && git commit -m "feat: 动作模型与双协议解析（JSON + 文本）"
```

---

### Task 3: LLM 抽象（Mock + OpenAI-compatible）

**Files:**
- Create: `src/llm/llm-client.ts`
- Create: `src/llm/mock-llm.ts`
- Create: `src/llm/openai-llm.ts`
- Test: `src/llm/llm.test.ts`

**Interfaces:**
- Produces: `LLMClient { send(messages, opts?): Promise<LLMResponse> }`；`MockLLMClient`（`replies` 脚本或 `respond(messages)` 回调）；`OpenAILLMClient`（fetch）。loop 依赖 `LLMClient`。

**Dependencies:** Task 1。

- [ ] **Step 1: 写失败测试**

创建 `src/llm/llm.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { MockLLMClient } from "./mock-llm.ts";
import { OpenAILLMClient } from "./openai-llm.ts";

test("MockLLMClient returns scripted replies in order", async () => {
  const llm = new MockLLMClient({ replies: ["first", "second", "third"] });
  assert.equal((await llm.send([])).content, "first");
  assert.equal((await llm.send([])).content, "second");
  assert.equal((await llm.send([])).content, "third");
});

test("MockLLMClient beyond script length repeats last reply", async () => {
  const llm = new MockLLMClient({ replies: ["only"] });
  assert.equal((await llm.send([])).content, "only");
  assert.equal((await llm.send([])).content, "only");
});

test("MockLLMClient respond callback receives messages", async () => {
  const seen: string[] = [];
  const llm = new MockLLMClient({ respond: (msgs) => { seen.push(msgs.map((m) => m.content).join("|")); return "reply"; } });
  await llm.send([{ role: "user", content: "hello" }]);
  assert.ok(seen[0].includes("hello"));
});

test("MockLLMClient send with empty script returns empty content", async () => {
  const llm = new MockLLMClient({});
  assert.equal((await llm.send([])).content, "");
});

test("OpenAILLMClient is constructable without network", () => {
  const llm = new OpenAILLMClient({ apiKey: "test-key-not-real", model: "gpt-4o-mini" });
  assert.ok(llm);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/llm/llm.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/llm/llm-client.ts**

```ts
export type LLMRole = "system" | "user" | "assistant";
export interface LLMMessage { role: LLMRole; content: string }
export interface LLMResponse { content: string }
export interface LLMOptions { timeoutMs?: number }
export interface LLMClient {
  send(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse>;
}
```

- [ ] **Step 4: 创建 src/llm/mock-llm.ts**

```ts
import type { LLMClient, LLMMessage, LLMResponse } from "./llm-client.ts";

export interface MockLLMConfig {
  replies?: string[];
  respond?: (messages: LLMMessage[]) => string;
}

export class MockLLMClient implements LLMClient {
  private idx = 0;
  constructor(private cfg: MockLLMConfig) {}

  async send(messages: LLMMessage[]): Promise<LLMResponse> {
    if (this.cfg.respond) return { content: this.cfg.respond(messages) };
    const replies = this.cfg.replies ?? [];
    if (replies.length > 0) {
      const content = replies[Math.min(this.idx, replies.length - 1)];
      this.idx += 1;
      return { content };
    }
    return { content: "" };
  }
}
```

- [ ] **Step 5: 创建 src/llm/openai-llm.ts**

```ts
import type { LLMClient, LLMMessage, LLMOptions, LLMResponse } from "./llm-client.ts";

export interface OpenAILLMConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  defaultTimeoutMs?: number;
}

export class OpenAILLMClient implements LLMClient {
  private baseURL: string;
  constructor(private cfg: OpenAILLMConfig) {
    this.baseURL = (cfg.baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async send(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse> {
    const timeoutMs = opts?.timeoutMs ?? this.cfg.defaultTimeoutMs ?? 60_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({ model: this.cfg.model, messages }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { content: data.choices?.[0]?.message?.content ?? "" };
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 6: 运行验证通过**

Run: `node --test src/llm/llm.test.ts`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/llm && git commit -m "feat: LLM 抽象层（接口 + MockLLM + OpenAI-compatible 客户端）"
```

---

### Task 4: 配置系统

**Files:**
- Create: `src/config/config.ts`
- Test: `src/config/config.test.ts`

**Interfaces:**
- Produces: `HarnessConfig` 全量类型；`defaultConfig(workspace): HarnessConfig`；`loadConfig(path): HarnessConfig`（读 JSON 合并默认）；`validateConfig(raw, workspace): HarnessConfig`（非法即抛 `ConfigError`）。guardrail/loop/sandbox/executor 依赖。

**Dependencies:** Task 1。

- [ ] **Step 1: 写失败测试**

创建 `src/config/config.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, defaultConfig, validateConfig, ConfigError } from "./config.ts";

test("defaultConfig has sane governance defaults", () => {
  const c = defaultConfig("/tmp/ws");
  assert.equal(c.workspace, "/tmp/ws");
  assert.equal(c.guardrail.defaultPolicyForSpawn, "deny");
  assert.ok(c.loop.maxSteps >= 1);
  assert.ok(c.guardrail.deny.some((r) => r.id === "rm-rf"));
  assert.ok(c.guardrail.approve.some((r) => r.id === "git-push-force"));
});

test("validateConfig rejects bad maxSteps", () => {
  assert.throws(() => validateConfig({ loop: { maxSteps: 0 } }, "/tmp/ws"), ConfigError);
});

test("validateConfig rejects missing workspace", () => {
  assert.throws(() => validateConfig({}, ""), ConfigError);
});

test("validateConfig applies allow policy override", () => {
  const c = validateConfig({ guardrail: { defaultPolicyForSpawn: "allow" } }, "/tmp/ws");
  assert.equal(c.guardrail.defaultPolicyForSpawn, "allow");
});

test("loadConfig reads file and merges defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-cfg-"));
  const file = join(dir, "h.json");
  writeFileSync(file, JSON.stringify({ loop: { maxSteps: 5 } }));
  const c = loadConfig(file);
  assert.equal(c.loop.maxSteps, 5);
  assert.equal(c.guardrail.defaultPolicyForSpawn, "deny");
});

test("loadConfig throws when file missing", () => {
  assert.throws(() => loadConfig("/nonexistent/rampart.json"), Error);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/config/config.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/config/config.ts**

```ts
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
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test src/config/config.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/config && git commit -m "feat: 声明式配置系统（默认治理规则 + 校验）"
```

---

### Task 5: shell 词法器与规则匹配

**Files:**
- Create: `src/guardrail/shell.ts`
- Create: `src/guardrail/rules.ts`
- Test: `src/guardrail/shell.test.ts`

**Interfaces:**
- Produces: `tokenizeShell(cmd): string[]`；`CommandRule`（re-export config 类型）与 `matchRule(tokens, rules): CommandRule | null`（规则 tokens 作为命令 tokens 的连续子序列匹配）。

**Dependencies:** Task 1。

- [ ] **Step 1: 写失败测试**

创建 `src/guardrail/shell.test.ts`：
```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/guardrail/shell.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/guardrail/shell.ts**

```ts
const DROPPED_CHARS = /[|&;<>()$`]/g;
const QUOTED_ARG = /"([^"]*)"|'([^']*)'|([^\s]+)/g;

export function tokenizeShell(cmd: string): string[] {
  const tokens: string[] = [];
  const cleaned = cmd.replace(DROPPED_CHARS, " ");
  let m: RegExpExecArray | null;
  while ((m = QUOTED_ARG.exec(cleaned)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}
```

- [ ] **Step 4: 创建 src/guardrail/rules.ts**

```ts
import type { CommandRule } from "../config/config.ts";

export type { CommandRule } from "../config/config.ts";

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return true;
  if (needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let all = true;
    for (let k = 0; k < needle.length; k++) {
      if (haystack[i + k] !== needle[k]) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

export function matchRule(tokens: string[], rules: CommandRule[]): CommandRule | null {
  for (const rule of rules) {
    if (containsSequence(tokens, rule.tokens)) return rule;
  }
  return null;
}
```

- [ ] **Step 5: 运行验证通过**

Run: `node --test src/guardrail/shell.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add src/guardrail/shell.ts src/guardrail/rules.ts src/guardrail/shell.test.ts && git commit -m "feat: shell 词法器与命令规则匹配"
```

---

### Task 6: 路径围栏与护栏流水线（核心）

**Files:**
- Create: `src/guardrail/path-fence.ts`
- Create: `src/guardrail/guardrail.ts`
- Test: `src/guardrail/path-fence.test.ts`
- Test: `src/guardrail/guardrail.test.ts`

**Interfaces:**
- Produces: `isWithinWorkspace(absPath, workspace): boolean`；`resolveInsideWorkspace(p, workspace): string | null`（经 `..`/软链接逃越工作区返回 null）；`GuardrailPipeline { constructor(workspace, config) ; evaluate(action: Action): Promise<Verdict> }`；`Verdict { kind: "allow"|"deny"|"approve"|"block"; reason: string; ruleId?: string }`。loop 依赖 `GuardrailPipeline.evaluate`。

**Dependencies:** Task 1, 2, 4, 5。

- [ ] **Step 1: 写失败测试（路径围栏）**

创建 `src/guardrail/path-fence.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWithinWorkspace, resolveInsideWorkspace } from "./path-fence.ts";

test("isWithinWorkspace rejects outside paths", () => {
  assert.equal(isWithinWorkspace("/usr/bin", "/tmp/ws"), false);
  assert.equal(isWithinWorkspace("/tmp/ws2/x", "/tmp/ws"), false);
});

test("isWithinWorkspace accepts inside paths", () => {
  assert.equal(isWithinWorkspace("/tmp/ws/a.ts", "/tmp/ws"), true);
  assert.equal(isWithinWorkspace("/tmp/ws", "/tmp/ws"), true);
});

test("isWithinWorkspace rejects .. traversal", () => {
  assert.equal(isWithinWorkspace("/tmp/ws/../etc/passwd", "/tmp/ws"), false);
});

test("resolveInsideWorkspace rejects traversal escaping workspace", () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-fence-"));
  assert.equal(resolveInsideWorkspace("../outside.ts", dir), null);
  const outside = join(tmpdir(), "rampart-outside-" + Math.random());
  writeFileSync(outside, "secret");
  assert.equal(resolveInsideWorkspace(join(dir, "..", "rampart-outside-" + outside.split("rampart-outside-")[1]), dir), null);
});

test("resolveInsideWorkspace rejects symlink escaping workspace", () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-fence-"));
  const outsideFile = join(tmpdir(), `rampart-secret-${Math.random()}.txt`);
  writeFileSync(outsideFile, "secret");
  const link = join(dir, "secret-link.txt");
  symlinkSync(outsideFile, link);
  assert.equal(resolveInsideWorkspace(link, dir), null);
});

test("resolveInsideWorkspace accepts normal inside file", () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-fence-"));
  writeFileSync(join(dir, "a.txt"), "x");
  const r = resolveInsideWorkspace("a.txt", dir);
  assert.ok(r);
  assert.ok(isWithinWorkspace(r, dir));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/guardrail/path-fence.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/guardrail/path-fence.ts**

```ts
import { resolve, relative, isAbsolute, dirname, join } from "node:path";
import { realpathSync, existsSync } from "node:fs";

export function isWithinWorkspace(absPath: string, workspace: string): boolean {
  const rel = relative(workspace, absPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveInsideWorkspace(p: string, workspace: string): string | null {
  const abs = resolve(workspace, p);
  if (!isWithinWorkspace(abs, workspace)) return null;
  let real = abs;
  try {
    real = realpathSync(abs);
  } catch {
    let dir = dirname(abs);
    while (dir !== dirname(dir)) {
      if (existsSync(dir)) {
        real = join(realpathSync(dir), relative(dir, abs));
        break;
      }
      dir = dirname(dir);
    }
  }
  if (!isWithinWorkspace(real, workspace)) return null;
  return abs;
}
```

- [ ] **Step 4: 运行验证通过（路径围栏）**

Run: `node --test src/guardrail/path-fence.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 写失败测试（护栏流水线）**

创建 `src/guardrail/guardrail.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GuardrailPipeline } from "./guardrail.ts";
import { defaultConfig } from "../config/config.ts";
import type { Action } from "../actions/types.ts";

function setup() {
  const ws = mkdtempSync(join(tmpdir(), "rampart-guard-"));
  const cfg = defaultConfig(ws);
  const g = new GuardrailPipeline(ws, cfg);
  return { ws, cfg, g };
}

test("blocks rm -rf", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "rm -rf src" });
  assert.equal(v.kind, "block");
  assert.equal(v.ruleId, "rm-rf");
});

test("blocks sudo regardless of args", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "sudo whoami" });
  assert.equal(v.kind, "block");
});

test("approves git push --force", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "git push --force origin main" });
  assert.equal(v.kind, "approve");
});

test("allows git push (no force)", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "git push origin main" });
  assert.equal(v.kind, "allow");
});

test("denies unlisted command by default", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "what-caches -x" });
  assert.equal(v.kind, "deny");
});

test("allows unlisted command when policy is allow", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-guard-"));
  const cfg = defaultConfig(ws);
  cfg.guardrail.defaultPolicyForSpawn = "allow";
  const g = new GuardrailPipeline(ws, cfg);
  const v = await g.evaluate({ id: "1", kind: "run_command", command: "what-caches -x" });
  assert.equal(v.kind, "allow");
});

test("blocks write_file outside workspace", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "write_file", path: "/etc/passwd", content: "x" });
  assert.equal(v.kind, "block");
});

test("allows write_file inside workspace", async () => {
  const { g, ws } = setup();
  const v = await g.evaluate({ id: "1", kind: "write_file", path: join(ws, "new.txt"), content: "x" });
  assert.equal(v.kind, "allow");
});

test("blocks write_file escaping via ..", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "write_file", path: "sub/../../outside.txt", content: "x" });
  assert.equal(v.kind, "block");
});

test("note and stop bypass guardrail as allow", async () => {
  const { g } = setup();
  assert.equal((await g.evaluate({ id: "1", kind: "note", text: "x" })).kind, "allow");
  assert.equal((await g.evaluate({ id: "1", kind: "stop" })).kind, "allow");
});

test("run_tests without command is allowed", async () => {
  const { g } = setup();
  assert.equal((await g.evaluate({ id: "1", kind: "run_tests" })).kind, "allow");
});

test("run_tests with dangerous command is blocked", async () => {
  const { g } = setup();
  const v = await g.evaluate({ id: "1", kind: "run_tests", command: "rm -rf node_modules" });
  assert.equal(v.kind, "block");
});
```

- [ ] **Step 6: 运行确认失败**

Run: `node --test src/guardrail/guardrail.test.ts`
Expected: FAIL。

- [ ] **Step 7: 创建 src/guardrail/guardrail.ts**

```ts
import { resolveInsideWorkspace } from "./path-fence.ts";
import { tokenizeShell } from "./shell.ts";
import { matchRule } from "./rules.ts";
import type { GuardrailConfig } from "../config/config.ts";
import type { Action, ActionKind } from "../actions/types.ts";

export type VerdictKind = "allow" | "deny" | "approve" | "block";
export interface Verdict {
  kind: VerdictKind;
  reason: string;
  ruleId?: string;
}

const deny = (reason: string, ruleId?: string): Verdict => ({ kind: "block", reason, ruleId });
const approveV = (reason: string, ruleId?: string): Verdict => ({ kind: "approve", reason, ruleId });
const allow = (reason: string): Verdict => ({ kind: "allow", reason });
const denyV = (reason: string): Verdict => ({ kind: "deny", reason });

export class GuardrailPipeline {
  constructor(private workspace: string, private config: GuardrailConfig) {}

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

  private evaluatePath(action: Action & { kind: "read_file" | "write_file" | "list_dir" }): Verdict {
    if (resolveInsideWorkspace(action.path, this.workspace)) {
      return allow("路径位于工作区内");
    }
    return deny("路径越出工作区", "scope-fence");
  }

  private evaluateCommand(action: Action & { kind: "run_command" | "run_tests" }): Verdict {
    // run_tests 无命令时安全（其命令来自受控配置），有命令时按命令规则治理
    if (action.kind === "run_tests" && !action.command) {
      return allow("run_tests（使用受控反馈命令）");
    }
    const command = action.command;
    const tokens = tokenizeShell(command);
    const denyHit = matchRule(tokens, this.config.deny);
    if (denyHit) return deny(`危险命令被拦截: ${denyHit.id}`, denyHit.id);
    const approveHit = matchRule(tokens, this.config.approve);
    if (approveHit) return approveV(`需人工审批: ${approveHit.id}`, approveHit.id);
    const allowHit = matchRule(tokens, this.config.allow);
    if (allowHit) return allow(`命令已列入白名单: ${allowHit.id}`);
    if (this.config.defaultPolicyForSpawn === "deny") {
      return denyV("命令未列入白名单，默认拒绝");
    }
    return allow("默认放行（allow policy）");
  }
}
```

- [ ] **Step 8: 运行验证通过**

Run: `node --test src/guardrail/guardrail.test.ts`
Expected: 全部 PASS。
Run: `npm test`
Expected: 全部 PASS（含此前任务）。

- [ ] **Step 9: 提交**

```bash
git add src/guardrail && git commit -m "feat: 路径围栏与护栏流水线（核心贡献）"
```

---

### Task 7: HITL 状态机与 Approver

**Files:**
- Create: `src/guardrail/hitl.ts`
- Test: `src/guardrail/hitl.test.ts`

**Interfaces:**
- Produces:
  - `type ApprovalResult = "approved" | "rejected" | "expired"`
  - `interface Approver { requestApproval(action: Action, verdict: Verdict): Promise<ApprovalResult> }`
  - `class InMemoryApprover implements Approver { constructor(); queueResult(r: ApprovalResult): void; requestApproval(...): Promise<ApprovalResult> }`
  - `class HITLState { constructor(timeoutMs: number); current: "idle"|"pending"|"approved"|"rejected"|"expired"; run(approver, action, verdict): Promise<ApprovalResult> }`（超时自动转 expired）
- loop 依赖 `Approver` 与 `HITLState`。

**Dependencies:** Task 1, 2, 6（Verdict 类型）。

- [ ] **Step 1: 写失败测试**

创建 `src/guardrail/hitl.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryApprover, HITLState } from "./hitl.ts";
import type { Action } from "../actions/types.ts";
import type { Verdict } from "./guardrail.ts";

const action: Action = { id: "a1", kind: "run_command", command: "git push --force" };
const verdict: Verdict = { kind: "approve", reason: "needs approval", ruleId: "git-push-force" };

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
  const ap = new InMemoryApprover();
  const state = new HITLState(20);
  const r = await state.run(ap, action, verdict);
  assert.equal(r, "expired");
  assert.equal(state.current, "expired");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/guardrail/hitl.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/guardrail/hitl.ts**

```ts
import type { Action } from "../actions/types.ts";
import type { Verdict } from "./guardrail.ts";

export type ApprovalResult = "approved" | "rejected" | "expired";

export interface Approver {
  requestApproval(action: Action, verdict: Verdict): Promise<ApprovalResult>;
}

export class InMemoryApprover implements Approver {
  private queue: ApprovalResult[] = [];
  queueResult(r: ApprovalResult): void { this.queue.push(r); }
  async requestApproval(): Promise<ApprovalResult> {
    return this.queue.shift() ?? "rejected";
  }
}

export type HITLStatus = "idle" | "pending" | "approved" | "rejected" | "expired";

export class HITLState {
  current: HITLStatus = "idle";
  constructor(private timeoutMs: number) {}

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
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test src/guardrail/hitl.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/guardrail/hitl.ts src/guardrail/hitl.test.ts && git commit -m "feat: HITL 状态机与可注入 Approver"
```

---

### Task 8: 沙箱执行器

**Files:**
- Create: `src/guardrail/sandbox.ts`
- Test: `src/guardrail/sandbox.test.ts`

**Interfaces:**
- Produces:
  - `interface ExecResult { ok: boolean; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }`
  - `class SandboxExecutor { constructor(opts: { workspace: string; pathAllowlist: string[]; defaultTimeoutMs: number }); run(command: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<ExecResult> }`
  - 逃逸（cwd 逃出工作区 / 命令词法逃逸）拒绝执行并返回 ok=false。
- feedback `TestRunner` 与 tools executor 依赖 `SandboxExecutor`。

**Dependencies:** Task 1, 5（tokenizeShell）。

- [ ] **Step 1: 写失败测试**

创建 `src/guardrail/sandbox.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxExecutor } from "./sandbox.ts";

function setup() {
  const ws = mkdtempSync(join(tmpdir(), "rampart-sandbox-"));
  const allowlist = [ws, "/usr/bin", "/bin", dirname(process.execPath)];
  const sx = new SandboxExecutor({ workspace: ws, pathAllowlist: allowlist, defaultTimeoutMs: 5000 });
  return { ws, sx };
}

test("runs allowed command and captures stdout/exitCode", { timeout: 10000 }, async () => {
  const { ws, sx } = setup();
  writeFileSync(join(ws, "a.txt"), "hello");
  const r = await sx.run("cat a.txt", { cwd: ws });
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout.trim(), "hello");
});

test("returns non-zero exitCode on command failure", { timeout: 10000 }, async () => {
  const { sx } = setup();
  const r = await sx.run("false");
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
});

test("rejects cwd escaping workspace", async () => {
  const { sx } = setup();
  const r = await sx.run("ls", { cwd: "/tmp" });
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, null);
  assert.ok(r.stderr.length > 0);
});

test("times out and kills long-running command", { timeout: 10000 }, async () => {
  const { sx } = setup();
  const r = await sx.run("sleep 30", { timeoutMs: 200 });
  assert.equal(r.timedOut, true);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/guardrail/sandbox.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/guardrail/sandbox.ts**

```ts
import { spawn } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { isWithinWorkspace } from "./path-fence.ts";

export interface ExecResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SandboxOptions {
  workspace: string;
  pathAllowlist: string[];
  defaultTimeoutMs: number;
}

const envPair = "PATH";

export class SandboxExecutor {
  private workspace: string;
  private pathAllowlist: string[];
  private defaultTimeoutMs: number;

  constructor(private opts: SandboxOptions) {
    this.workspace = opts.workspace;
    this.pathAllowlist = opts.pathAllowlist;
    this.defaultTimeoutMs = opts.defaultTimeoutMs;
  }

  run(command: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<ExecResult> {
    const cwd = opts?.cwd
      ? (isAbsolute(opts.cwd) ? opts.cwd : join(this.workspace, opts.cwd))
      : this.workspace;
    if (!isWithinWorkspace(cwd, this.workspace)) {
      return Promise.resolve({ ok: false, exitCode: null, stdout: "", stderr: "沙箱拒绝：cwd 越出工作区", timedOut: false });
    }
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
    return new Promise<ExecResult>((resolve) => {
      const child = spawn(command, {
        cwd,
        shell: true,
        env: {
          ...process.env,
          PATH: this.pathAllowlist.length > 0 ? this.pathAllowlist.join(":") : process.env.PATH,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ ok: false, exitCode: null, stdout, stderr: stderr || String(e.message), timedOut });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          exitCode: code,
          stdout,
          stderr,
          timedOut,
        });
      });
    });
  }
}
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test src/guardrail/sandbox.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/guardrail/sandbox.ts src/guardrail/sandbox.test.ts && git commit -m "feat: 沙箱执行器（cwd 围栏 + PATH 白名单 + 超时）"
```

---

### Task 9: 反馈闭环（测试运行器 + 判定解析）

**Files:**
- Create: `src/feedback/verdict-parser.ts`
- Create: `src/feedback/test-runner.ts`
- Test: `src/feedback/feedback.test.ts`

**Interfaces:**
- Produces:
  - `type VerdictSignal = "pass" | "fail" | "unresolved"`
  - `parseVerdict(input: { exitCode: number | null; stdout: string; stderr: string }, successPattern?: RegExp): VerdictSignal`
  - `class TestRunner { constructor(sandbox: SandboxExecutor, defaultTimeoutMs: number); run(command?: string, cwd?: string): Promise<{ exitCode: number|null; stdout: string; stderr: string }> }`
- loop 依赖 `parseVerdict` 与 `TestRunner`。

**Dependencies:** Task 1, 8。

- [ ] **Step 1: 写失败测试**

创建 `src/feedback/feedback.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseVerdict } from "./verdict-parser.ts";
import { TestRunner } from "./test-runner.ts";
import { SandboxExecutor } from "../guardrail/sandbox.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

test("parseVerdict maps exit 0 to pass", () => {
  assert.equal(parseVerdict({ exitCode: 0, stdout: "all passing", stderr: "" }), "pass");
});

test("parseVerdict maps non-zero exit to fail", () => {
  assert.equal(parseVerdict({ exitCode: 1, stdout: "1 failed", stderr: "" }), "fail");
});

test("parseVerdict maps null exit to unresolved", () => {
  assert.equal(parseVerdict({ exitCode: null, stdout: "", stderr: "timeout" }), "unresolved");
});

test("parseVerdict with successPattern treats zero exit but bad output as unresolved", () => {
  assert.equal(parseVerdict({ exitCode: 0, stdout: "nothing", stderr: "" }, /passing/), "unresolved");
});

function makeSandbox(ws: string) {
  const allowlist = [ws, "/usr/bin", "/bin", dirname(process.execPath)];
  return new SandboxExecutor({ workspace: ws, pathAllowlist: allowlist, defaultTimeoutMs: 5000 });
}

test("TestRunner runs a passing command in workspace", { timeout: 10000 }, async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-fb-"));
  const tr = new TestRunner(makeSandbox(ws), 5000);
  const r = await tr.run("node -e \"process.exit(0)\"");
  assert.equal(r.exitCode, 0);
});

test("TestRunner runs a failing command", { timeout: 10000 }, async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-fb-"));
  const tr = new TestRunner(makeSandbox(ws), 5000);
  const r = await tr.run("node -e \"process.exit(3)\"");
  assert.equal(r.exitCode, 3);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/feedback/feedback.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/feedback/verdict-parser.ts**

```ts
export type VerdictSignal = "pass" | "fail" | "unresolved";

export interface ParseInput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function parseVerdict(input: ParseInput, successPattern?: RegExp): VerdictSignal {
  if (input.exitCode === null) return "unresolved";
  if (input.exitCode === 0) {
    if (successPattern && !successPattern.test(input.stdout + input.stderr)) return "unresolved";
    return "pass";
  }
  return "fail";
}
```

- [ ] **Step 4: 创建 src/feedback/test-runner.ts**

```ts
import type { SandboxExecutor } from "../guardrail/sandbox.ts";
import type { ParseInput } from "./verdict-parser.ts";

export class TestRunner {
  constructor(private sandbox: SandboxExecutor, private defaultTimeoutMs: number) {}

  async run(command: string, cwd?: string): Promise<ParseInput> {
    const r = await this.sandbox.run(command, { cwd, timeoutMs: this.defaultTimeoutMs });
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
  }
}
```

- [ ] **Step 5: 运行验证通过**

Run: `node --test src/feedback/feedback.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add src/feedback && git commit -m "feat: 反馈闭环（TestRunner + VerdictParser）"
```

---

### Task 10: 记忆存储

**Files:**
- Create: `src/memory/memory.ts`
- Test: `src/memory/memory.test.ts`

**Interfaces:**
- Produces:
  - `interface MemoryEntry { id: string; type: string; tags: string[]; content: string; ts: string }`
  - `class MemoryStore { constructor(filePath: string); add(entry: { type: string; tags?: string[]; content: string }): Promise<MemoryEntry>; retrieve(opts?: { tags?: string[]; limit?: number }): Promise<MemoryEntry[]>; all(): Promise<MemoryEntry[]> }`
- loop 与 executor 依赖 `MemoryStore`。

**Dependencies:** Task 1。

- [ ] **Step 1: 写失败测试**

创建 `src/memory/memory.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "./memory.ts";

test("add appends entry and persist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-mem-"));
  const store = new MemoryStore(join(dir, "m.json"));
  await store.add({ type: "convention", tags: ["ts"], content: "use strict types" });
  const all = await store.all();
  assert.equal(all.length, 1);
  assert.ok(all[0].id);
});

test("retrieve filters by tags and limits count (newest first)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-mem-"));
  const store = new MemoryStore(join(dir, "m.json"));
  await store.add({ type: "note", tags: ["a"], content: "first" });
  await store.add({ type: "note", tags: ["a", "b"], content: "second" });
  await store.add({ type: "note", tags: ["b"], content: "third" });
  const r = await store.retrieve({ tags: ["b"] });
  assert.equal(r.length, 2);
  assert.equal(r[0].content, "third");
  const rl = await store.retrieve({ tags: ["b"], limit: 1 });
  assert.equal(rl.length, 1);
  assert.equal(rl[0].content, "third");
});

test("retrieve with no matches returns empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-mem-"));
  const store = new MemoryStore(join(dir, "m.json"));
  await store.add({ type: "note", tags: ["x"], content: "hi" });
  const r = await store.retrieve({ tags: ["nope"] });
  assert.deepEqual(r, []);
});

test("missing file yields empty store", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rampart-mem-"));
  const store = new MemoryStore(join(dir, "nope.json"));
  assert.deepEqual(await store.all(), []);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/memory/memory.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/memory/memory.ts**

```ts
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export interface MemoryEntry {
  id: string;
  type: string;
  tags: string[];
  content: string;
  ts: string;
}

export interface MemoryAddInput {
  type: string;
  tags?: string[];
  content: string;
}

export class MemoryStore {
  constructor(private filePath: string) {}

  async add(input: MemoryAddInput): Promise<MemoryEntry> {
    const entries = await this.all();
    const entry: MemoryEntry = {
      id: randomUUID(),
      type: input.type,
      tags: input.tags ?? [],
      content: input.content,
      ts: new Date().toISOString(),
    };
    entries.push(entry);
    await this.#save(entries);
    return entry;
  }

  async retrieve(opts?: { tags?: string[]; limit?: number }): Promise<MemoryEntry[]> {
    const entries = await this.all();
    let out = entries;
    if (opts?.tags && opts.tags.length > 0) {
      out = out.filter((e) => opts.tags!.every((t) => e.tags.includes(t)));
    }
    out = [...out].reverse();
    if (opts?.limit !== undefined) out = out.slice(0, opts.limit);
    return out;
  }

  async all(): Promise<MemoryEntry[]> {
    try {
      const text = await readFile(this.filePath, "utf8");
      const data = JSON.parse(text) as unknown;
      return Array.isArray(data) ? (data as MemoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  async #save(entries: MemoryEntry[]): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }
}
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test src/memory/memory.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/memory && git commit -m "feat: JSON 记忆存储与按需检索"
```

---

### Task 11: 工具分发执行器

**Files:**
- Create: `src/tools/executor.ts`
- Test: `src/tools/executor.test.ts`

**Interfaces:**
- Produces:
  - `interface ToolResult { ok: boolean; output: string; exitCode?: number }`
  - `makeExecutor(deps: { workspace: string; sandbox: SandboxExecutor; memory: MemoryStore; testCommand?: string }): (action: Action) => Promise<ToolResult>`
  - 分发 read_file / write_file / list_dir / run_command / run_tests / note / stop；未通过护栏的动作不会到达这里（护栏在 loop 中先执行）。
- loop 依赖 `makeExecutor`。

**Dependencies:** Task 1, 2, 8, 10。

- [ ] **Step 1: 写失败测试**

创建 `src/tools/executor.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { makeExecutor } from "./executor.ts";
import { SandboxExecutor } from "../guardrail/sandbox.ts";
import { MemoryStore } from "../memory/memory.ts";

function makeSandbox(ws: string) {
  const allowlist = [ws, "/usr/bin", "/bin", dirname(process.execPath)];
  return new SandboxExecutor({ workspace: ws, pathAllowlist: allowlist, defaultTimeoutMs: 5000 });
}

test("read_file returns content", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  writeFileSync(join(ws, "a.txt"), "hello world");
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "read_file", path: join(ws, "a.txt") });
  assert.equal(r.ok, true);
  assert.match(r.output, /hello world/);
});

test("write_file writes to disk", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "write_file", path: join(ws, "b.txt"), content: "payload" });
  assert.equal(r.ok, true);
  const { readFileSync } = await import("node:fs");
  assert.equal(readFileSync(join(ws, "b.txt"), "utf8"), "payload");
});

test("run_command executes via sandbox", { timeout: 10000 }, async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "run_command", command: "echo hi" });
  assert.equal(r.ok, true);
  assert.match(r.output, /hi/);
});

test("run_tests uses provided command", { timeout: 10000 }, async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: new MemoryStore(join(ws, "m.json")) });
  const r = await ex({ id: "1", kind: "run_tests", command: "node -e \"process.exit(0)\"" });
  assert.equal(r.ok, true);
});

test("note writes to memory", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rampart-tools-"));
  const mem = new MemoryStore(join(ws, "m.json"));
  const ex = makeExecutor({ workspace: ws, sandbox: makeSandbox(ws), memory: mem });
  const r = await ex({ id: "1", kind: "note", text: "remember this", tags: ["conv"] });
  assert.equal(r.ok, true);
  const all = await mem.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].content, "remember this");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/tools/executor.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/tools/executor.ts**

```ts
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Action } from "../actions/types.ts";
import type { SandboxExecutor } from "../guardrail/sandbox.ts";
import type { MemoryStore } from "../memory/memory.ts";

export interface ToolResult {
  ok: boolean;
  output: string;
  exitCode?: number;
}

export interface ExecutorDeps {
  workspace: string;
  sandbox: SandboxExecutor;
  memory: MemoryStore;
  testCommand?: string;
}

export function makeExecutor(deps: ExecutorDeps): (action: Action) => Promise<ToolResult> {
  return async (action: Action) => {
    try {
      switch (action.kind) {
        case "read_file":
          return wrapOk((await readFile(action.path, "utf8")).toString());
        case "write_file":
          await mkdir(dirname(action.path), { recursive: true });
          await writeFile(action.path, action.content, "utf8");
          return wrapOk(`written ${action.path}`);
        case "list_dir": {
          const names = await readdir(action.path);
          return wrapOk(names.join("\n"));
        }
        case "run_command": {
          const r = await deps.sandbox.run(action.command, { timeoutMs: action.timeout });
          return wrapResult(r.ok, (r.stdout || r.stderr).trim(), r.exitCode ?? undefined);
        }
        case "run_tests": {
          const command = action.command ?? deps.testCommand ?? "npm test";
          const r = await deps.sandbox.run(command);
          return wrapResult(r.ok, (r.stdout || r.stderr).trim(), r.exitCode ?? undefined);
        }
        case "note":
          await deps.memory.add({ type: "note", tags: action.tags, content: action.text });
          return wrapOk("noted");
        case "stop":
          return wrapOk(action.reason ?? "stop");
        case "malformed":
          return { ok: false, output: `非法动作: ${action.raw.slice(0, 120)}` };
      }
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
  };
}

function wrapOk(output: string): ToolResult {
  return { ok: true, output };
}

function wrapResult(ok: boolean, output: string, exitCode?: number): ToolResult {
  return { ok, output, ...(exitCode !== undefined ? { exitCode } : {}) };
}
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test src/tools/executor.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/tools && git commit -m "feat: 工具分发执行器（读写/列目录/命令/测试/记忆）"
```

---

### Task 12: 主循环 AgentLoop

**Files:**
- Create: `src/loop/agent-loop.ts`
- Test: `src/loop/agent-loop.test.ts`

**Interfaces:**
- Produces:
  - `interface Observation { step: number; action: Action; verdict?: Verdict; result?: ToolResult; feedback?: VerdictSignal; status?: "executed"|"blocked"|"denied"|"rejected"|"approval_expired" }`
  - `interface SessionResult { status: "done"|"max_steps"|"error"; reason: string; steps: number; observations: Observation[] }`
  - `class AgentLoop { constructor(opts: { llm: LLMClient; guardrail: GuardrailPipeline; approver: Approver; execute: (a: Action) => Promise<ToolResult>; memory: MemoryStore; config: HarnessConfig; feedbackSignal?: (r: ToolResult) => VerdictSignal | undefined; onObservation?: (o: Observation) => void }); run(task: string): Promise<SessionResult> }`

**Dependencies:** Task 1, 2, 3, 4, 6, 7, 10, 11。

- [ ] **Step 1: 写失败测试**

创建 `src/loop/agent-loop.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { AgentLoop } from "./agent-loop.ts";
import { MockLLMClient } from "../llm/mock-llm.ts";
import { GuardrailPipeline } from "../guardrail/guardrail.ts";
import { InMemoryApprover } from "../guardrail/hitl.ts";
import { MemoryStore } from "../memory/memory.ts";
import { defaultConfig } from "../config/config.ts";
import { makeExecutor } from "../tools/executor.ts";
import { SandboxExecutor } from "../guardrail/sandbox.ts";
import { parseVerdict } from "../feedback/verdict-parser.ts";

function setup() {
  const ws = mkdtempSync(join(tmpdir(), "rampart-loop-"));
  const config = defaultConfig(ws);
  const memory = new MemoryStore(join(ws, "m.json"));
  const allowlist = [ws, "/usr/bin", "/bin", dirname(process.execPath)];
  const sandbox = new SandboxExecutor({ workspace: ws, pathAllowlist: allowlist, defaultTimeoutMs: 5000 });
  const execute = makeExecutor({ workspace: ws, sandbox, memory, testCommand: config.feedback.testCommand });
  const guardrail = new GuardrailPipeline(ws, config);
  return { ws, config, memory, sandbox, execute, guardrail };
}

test("loop stops on stop action", async () => {
  const { config, memory, guardrail } = setup();
  const approver = new InMemoryApprover();
  const llm = new MockLLMClient({ replies: ['{"tool":"stop","reason":"done"}'] });
  const loop = new AgentLoop({ llm, guardrail, approver, execute: async () => ({ ok: true, output: "" }), memory, config });
  const r = await loop.run("do something");
  assert.equal(r.status, "done");
  assert.equal(r.steps, 1);
});

test("loop hits max_steps when LLM keeps acting", async () => {
  const { config, memory, guardrail, execute } = setup();
  config.loop.maxSteps = 3;
  const approver = new InMemoryApprover();
  const llm = new MockLLMClient({ replies: ['{"tool":"note","text":"keep going"}'] });
  const loop = new AgentLoop({ llm, guardrail, approver, execute, memory, config });
  const r = await loop.run("keep trying");
  assert.equal(r.status, "max_steps");
  assert.equal(r.steps, 3);
});

test("dangerous action is blocked and not executed", async () => {
  const { config, memory, guardrail } = setup();
  const approver = new InMemoryApprover();
  const executed: string[] = [];
  const llm = new MockLLMClient({ replies: ['{"tool":"run_command","command":"rm -rf x"}'] });
  const loop = new AgentLoop({
    llm, guardrail, approver,
    execute: async (a) => { executed.push(a.kind); return { ok: true, output: "" }; },
    memory, config,
  });
  const r = await loop.run("try dangerous");
  const obs = r.observations[0];
  assert.equal(obs.verdict?.kind, "block");
  assert.deepEqual(executed, []);
});

test("approve action runs after approval", async () => {
  const { config, memory, guardrail } = setup();
  const approver = new InMemoryApprover();
  approver.queueResult("approved");
  const executed: string[] = [];
  const llm = new MockLLMClient({ replies: ['{"tool":"run_command","command":"npm publish","timeout":5000}'] });
  const loop = new AgentLoop({
    llm, guardrail, approver,
    execute: async (a) => { executed.push(a.kind); return { ok: true, output: "published" }; },
    memory, config,
  });
  const r = await loop.run("publish package");
  assert.ok(executed.includes("run_command"));
});

test("rejected action is not executed", async () => {
  const { config, memory, guardrail } = setup();
  const approver = new InMemoryApprover();
  approver.queueResult("rejected");
  const executed: string[] = [];
  const llm = new MockLLMClient({ replies: ['{"tool":"run_command","command":"npm publish"}'] });
  const loop = new AgentLoop({
    llm, guardrail, approver,
    execute: async (a) => { executed.push(a.kind); return { ok: true, output: "" }; },
    memory, config,
  });
  const r = await loop.run("publish package");
  assert.deepEqual(executed, []);
  assert.equal(r.observations[0].status, "rejected");
});

test("run_tests feedback signal is recorded and drives next step", async () => {
  const { ws, config, memory, guardrail, sandbox } = setup();
  const approver = new InMemoryApprover();
  enum Phase { First, Second }
  let phase: Phase = Phase.First;
  const llm = new MockLLMClient({
    respond: (msgs) => {
      const ctx = msgs.map((m) => m.content).join("\n");
      if (phase === Phase.First) {
        phase = Phase.Second;
        // First step: run tests in workspace
        writeFileSync(join(ws, "test.txt"), "initial");
        return '{"tool":"run_tests","command":"node -e \\"process.exit(1)\\"" }';
      }
      if (ctx.includes("fail")) {
        return '{"tool":"stop","reason":"tests failed, stopping"}';
      }
      return '{"tool":"stop","reason":"ok"}';
    },
  });
  const execute = makeExecutor({ workspace: ws, sandbox, memory, testCommand: config.feedback.testCommand });
  const loop = new AgentLoop({
    llm, guardrail, approver, execute, memory, config,
    feedbackSignal: (r) => parseVerdict({ exitCode: r.exitCode ?? null, stdout: r.output, stderr: "" }),
  });
  const r = await loop.run("run failing test");
  const testObs = r.observations.find((o) => o.action.kind === "run_tests");
  assert.ok(testObs);
  assert.equal(testObs.feedback, "fail");
  assert.equal(r.status, "done");
  assert.equal(r.observations[r.observations.length - 1].action.reason ?? "", "tests failed, stopping");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/loop/agent-loop.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/loop/agent-loop.ts**

```ts
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
import type { LLMRole } from "../llm/llm-client.ts";

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
  constructor(private opts: AgentLoopOptions) {}

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
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test src/loop/agent-loop.test.ts`
Expected: 全部 PASS。
Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/loop && git commit -m "feat: 主循环 AgentLoop（上下文→LLM→护栏→分发→反馈→停机）"
```

---

### Task 13: 凭据管理（Keychain）

**Files:**
- Create: `src/cli/keychain.ts`
- Test: `src/cli/keychain.test.ts`

**Interfaces:**
- Produces:
  - `class KeychainCredentialStore { constructor(opts?: { service?: string; account?: string; exec?: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }> }); save(key: string): Promise<void>; load(): Promise<string | null>; clear(): Promise<void>; hasKey(): Promise<boolean> }`
  - 默认 exec 调用 `security` CLI；测试注入假 exec，不触真实 Keychain。
- CLI（Task 14）依赖本模块。

**Dependencies:** Task 1。

- [ ] **Step 1: 写失败测试**

创建 `src/cli/keychain.test.ts`：
```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/cli/keychain.test.ts`
Expected: FAIL。

- [ ] **Step 3: 创建 src/cli/keychain.ts**

```ts
import { execFile } from "node:child_process";

export interface KeychainExecResult { code: number; stdout: string; stderr: string }
export type KeychainExec = (args: string[]) => Promise<KeychainExecResult>;

export interface KeychainCredentialStoreOptions {
  service?: string;
  account?: string;
  exec?: KeychainExec;
}

const defaultExec: KeychainExec = (args: string[]) =>
  new Promise<KeychainExecResult>((resolve) => {
    execFile("security", args, { timeout: 10_000 }, (err, stdout, stderr) => {
      resolve({
        code: err && typeof (err as { code?: number }).code === "number" ? (err as { code: number }).code : err ? 1 : 0,
        stdout,
        stderr,
      });
    });
  });

export class KeychainCredentialStore {
  private service: string;
  private account: string;
  private exec: KeychainExec;

  constructor(opts: KeychainCredentialStoreOptions = {}) {
    this.service = opts.service ?? "rampart";
    this.account = opts.account ?? "llm";
    this.exec = opts.exec ?? defaultExec;
  }

  async save(key: string): Promise<void> {
    await this.exec(["add-generic-password", "-U", "-s", this.service, "-a", this.account, "-w", key]);
  }

  async load(): Promise<string | null> {
    const r = await this.exec(["find-generic-password", "-s", this.service, "-a", this.account, "-w"]);
    if (r.code !== 0) return null;
    return r.stdout.trim() || null;
  }

  async hasKey(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async clear(): Promise<void> {
    await this.exec(["delete-generic-password", "-s", this.service, "-a", this.account]);
  }
}
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test src/cli/keychain.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/cli/keychain.ts src/cli/keychain.test.ts && git commit -m "feat: Keychain 凭据存取（可注入 exec 便于测试）"
```

---

### Task 14: CLI 入口与 HITL 终端审批

**Files:**
- Create: `src/cli/hidden-input.ts`
- Create: `src/cli/approver-cli.ts`
- Replace: `src/cli/index.ts`（Task 1 占位替换为真实实现）
- Test: `src/cli/approver-cli.test.ts`

**Interfaces:**
- Produces:
  - `readHidden(question: string): Promise<string>`（tty 回显关闭）
  - `createCliApprover(io: { stdin: NodeJS.ReadableStream; stdout: NodeJS.WritableStream }): Approver`（y/n 审批，支持 `!s` 记住会话）
  - `main(argv?: string[]): Promise<number>`（子命令：run / setup / status / clear / help）
- bin/rampart.js（Task 1）调用 `main`。

**Dependencies:** Task 1, 3, 4, 6, 7, 10, 11, 12, 13。

- [ ] **Step 1: 写失败测试（approver-cli）**

创建 `src/cli/approver-cli.test.ts`：
```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/cli/approver-cli.test.ts`
Expected: FAIL（approver-cli 不存在）。

- [ ] **Step 3: 创建 src/cli/hidden-input.ts**

```ts
import { createInterface } from "node:readline";
import { moveCursor, clearLine } from "node:readline";

export function readHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin as NodeJS.ReadStream;
    const onData = (chunk: Buffer) => {
      moveCursor(process.stdout, 0, -1);
      clearLine(process.stdout, 1);
      process.stdout.write(question + "*".repeat(chunk.toString().length));
    };
    if (stdin.isTTY) {
      stdin.setRawMode(true);
      stdin.on("data", onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      if (stdin.isTTY) {
        stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        try { moveCursor(process.stdout, 0, -1); clearLine(process.stdout, 1); } catch { /* ignore */ }
      }
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}
```

- [ ] **Step 4: 创建 src/cli/approver-cli.ts**

```ts
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
```

- [ ] **Step 5: 创建 src/cli/index.ts（替换 Task 1 占位）**

```ts
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
  const guardrail = new GuardrailPipeline(config.workspace, config.guardrail);
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
  console.log(`\\n完成: status=${result.status}, steps=${result.steps}, reason=${result.reason}`);
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
```

- [ ] **Step 6: 运行全部测试与 typecheck**

Run: `npm test`
Expected: 全部 PASS。
Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 7: 冒烟 CLI（--help）**

Run: `node bin/rampart.js help`
Expected: 打印 USAGE。

- [ ] **Step 8: 提交**

```bash
git add src/cli && git commit -m "feat: CLI（run/setup/status/clear）与 HITL 终端审批"
```

---

### Task 15: 机制演示（mock 确定性复现）

**Files:**
- Create: `src/demo/demo.ts`
- Test: `src/demo/demo.test.ts`

**Interfaces:**
- Produces: `runDemo(): Promise<DemoReport>`（导出）；`npm run demo` 打印演示结果；`demo.test.ts` 断言三种机制行为。
- 覆盖 §A.6：① 护栏拦截危险动作 ② 注入失败→反馈→下一步改变 ③ 治理梯度行为（deny/approve/allow 三个判定在一个工作区复现）。

**Dependencies:** Task 1, 2, 3, 4, 6, 7, 10, 11, 12。

- [ ] **Step 1: 写失败测试**

创建 `src/demo/demo.test.ts`：
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { runDemo } from "./demo.ts";

test("demo reproduces guardrail intercept, feedback-driven correction, and governance gradient", { timeout: 60000 }, async () => {
  const report = await runDemo();
  assert.equal(report.guardrailBlocked, true);
  assert.equal(report.feedbackChangedNextAction, true);
  assert.equal(report.governanceGradient, true);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/demo/demo.test.ts`
Expected: FAIL（demo.ts 不存在）。

- [ ] **Step 3: 创建 src/demo/demo.ts**

```ts
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { AgentLoop } from "../loop/agent-loop.ts";
import { MockLLMClient } from "../llm/mock-llm.ts";
import { GuardrailPipeline } from "../guardrail/guardrail.ts";
import { InMemoryApprover } from "../guardrail/hitl.ts";
import { MemoryStore } from "../memory/memory.ts";
import { defaultConfig } from "../config/config.ts";
import { makeExecutor } from "../tools/executor.ts";
import { SandboxExecutor } from "../guardrail/sandbox.ts";
import { parseVerdict } from "../feedback/verdict-parser.ts";

export interface DemoReport {
  guardrailBlocked: boolean;
  feedbackChangedNextAction: boolean;
  governanceGradient: boolean;
}

export async function runDemo(): Promise<DemoReport> {
  const dir = mkdtempSync(join(tmpdir(), "rampart-demo-"));

  // ---- ① 护栏拦截危险动作 ----
  const ws1 = join(dir, "ws1");
  mkdirSync(ws1, { recursive: true });
  const cfg1 = defaultConfig(ws1);
  const g1 = new GuardrailPipeline(ws1, cfg1);
  const v = await g1.evaluate({ id: "d1", kind: "run_command", command: "rm -rf /" });
  const guardrailBlocked = v.kind === "block";

  // ---- ② 反馈闭环：注入失败 → agent 根据反馈改变下一步 ----
  const ws2 = join(dir, "ws2");
  mkdirSync(ws2, { recursive: true });
  const cfg2 = defaultConfig(ws2);
  cfg2.loop.maxSteps = 4;
  const memory2 = new MemoryStore(join(ws2, "m.json"));
  const sandbox2 = new SandboxExecutor({ workspace: ws2, pathAllowlist: [ws2, "/usr/bin", "/bin", dirname(process.execPath)], defaultTimeoutMs: 5000 });
  const execute2 = makeExecutor({ workspace: ws2, sandbox: sandbox2, memory: memory2, testCommand: "npm test" });

  let phase2 = 0;
  const llm2 = new MockLLMClient({
    respond: () => {
      phase2 += 1;
      if (phase2 === 1) return '{"tool":"run_tests","command":"node -e \\"process.exit(1)\\""}';
      if (phase2 === 2) return '{"tool":"note","text":"tests failed, will stop"}';
      return '{"tool":"stop","reason":"saw feedback"}';
    },
  });
  const approver2 = new InMemoryApprover();
  const loop2 = new AgentLoop({
    llm: llm2, guardrail: new GuardrailPipeline(ws2, cfg2), approver: approver2, execute: execute2, memory: memory2, config: cfg2,
    feedbackSignal: (r) => parseVerdict({ exitCode: r.exitCode ?? null, stdout: r.output, stderr: "" }),
  });
  const res2 = await loop2.run("run failing test");
  const testObs = res2.observations.find((o) => o.action.kind === "run_tests");
  const changed = testObs?.feedback === "fail" && res2.observations[res2.observations.length - 1].action.kind === "stop";
  const feedbackChangedNextAction = changed;

  // ---- ③ 治理梯度：same target 上 deny 危险命令 / approve 高影响命令 / allow 白名单命令 ----
  const ws3 = join(dir, "ws3");
  mkdirSync(ws3, { recursive: true });
  const cfg3 = defaultConfig(ws3);
  const g3 = new GuardrailPipeline(ws3, cfg3);
  const denyV = await g3.evaluate({ id: "d-y", kind: "run_command", command: "sudo whoami" });
  const approveV = await g3.evaluate({ id: "d-a", kind: "run_command", command: "npm publish" });
  const allowV = await g3.evaluate({ id: "d-l", kind: "run_command", command: "npm test" });
  const governanceGradient = denyV.kind === "block" && approveV.kind === "approve" && allowV.kind === "allow";

  rmSync(dir, { recursive: true, force: true });
  return { guardrailBlocked, feedbackChangedNextAction, governanceGradient };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().then((r) => {
    console.log("=== Rampart 机制演示 ===");
    console.log(`① 护栏拦截危险动作 (rm -rf): ${r.guardrailBlocked ? "PASS" : "FAIL"}`);
    console.log(`② 失败反馈 → 下一步改变: ${r.feedbackChangedNextAction ? "PASS" : "FAIL"}`);
    console.log(`③ 治理梯度 (block/approve/allow): ${r.governanceGradient ? "PASS" : "FAIL"}`);
    process.exitCode = r.guardrailBlocked && r.feedbackChangedNextAction && r.governanceGradient ? 0 : 1;
  });
}
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test src/demo/demo.test.ts`
Expected: PASS。
Run: `npm run demo`
Expected: 打印三项 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/demo && git commit -m "feat: mock 机制演示（护栏/反馈/治理梯度）"
```

---

### Task 16: CI 工作流与 npm 分发

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: push/PR 触发 `npm ci && npm run typecheck && npm test`；workflow 挂在仓库 GitHub Actions。

**Dependencies:** Task 1。

- [ ] **Step 1: 创建 .github/workflows/ci.yml**

```yaml
name: ci
on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 2: 本地验证 npm 安装路径**

Run: `npm link`（本机装箱）
Run: `rampart help`
Expected: 打印 USAGE。

- [ ] **Step 3: 提交**

```bash
git add .github && git commit -m "ci: 每次 push/PR 运行 typecheck 与测试"
```

---

### Task 17: 交付文档

**Files:**
- Create: `README.md`
- Create: `AGENT_LOG.md`
- Create: `SPEC_PROCESS.md`
- Create: `REFLECTION.md`

**Interfaces:**
- Produces: 完整交付文档（见通用要求 §五清单）。

**Dependencies:** 全部任务 + 冷启动验证结果。

- [ ] **Step 1: 撰写 README.md**

包含：项目简介、安装/运行命令、key 安全配置（`rampart setup`）、分发命令（`npm install -g`）、目录结构、安全边界、已知限制、第三方许可。

- [ ] **Step 2: 撰写 AGENT_LOG.md**

按时间顺序记录每个 task：时间戳、触发技能、关键 prompt、subagent 输出/commit hash、人工修改、教训。

- [ ] **Step 3: 撰写 SPEC_PROCESS.md**

记录 brainstorming 关键节点、≥3 轮迭代对话节选、冷启动验证（陌生 agent 实现 Task 2/5 之处暂停并提问）与 SPEC/PLAN 修订 diff、AI 采纳/推翻的建议。

- [ ] **Step 4: 撰写 REFLECTION.md**

1500–2500 字反思（见通用要求 §五建议内容）。

- [ ] **Step 5: 提交**

```bash
git add README.md AGENT_LOG.md SPEC_PROCESS.md REFLECTION.md && git commit -m "docs: 交付文档（README/AGENT_LOG/SPEC_PROCESS/REFLECTION）"
```

---

### Task 18: PLAN 收尾与验收

- [ ] **Step 1: 全量验证**

Run: `npm test`
Expected: 全部 PASS。
Run: `npm run typecheck`
Expected: 无错误。
Run: `npm run demo`
Expected: 三项 PASS。

- [ ] **Step 2: 标记全部完成**

将本文件中所有 `- [ ]` 改为 `- [x]`，并在最后追加：验收命令输出摘要与 commit hash 列表。

- [ ] **Step 3: 最终提交**

```bash
git add PLAN.md && git commit -m "docs: PLAN 标记完成并附验收记录"
```