# SPEC.md · Rampart —— 带治理护栏的 Coding Agent Harness

> 作者：个人项目（AI4SE 期末项目 A · Coding Agent Harness）
> 日期：2026-08-15
> 适用范围：本文件为设计规约。与《通用要求》及《A · Coding Agent Harness》拼接阅读。

---

## 1. 问题陈述

### 1.1 要解决什么问题

现代编码智能体（Claude Code、Cursor、Copilot 等）的本质是 **Agent = LLM + Harness**：LLM 只负责"下一步做什么"这一行决策，其余全部是工程——上下文组织、工具执行、治理护栏、反馈闭环、记忆与配置。这些工程能力决定了一个 agent 能否**稳定、可靠、安全**地在真实软件项目上长期工作。

目前多数 harness 由闭源厂商提供，其治理、反馈、记忆机制是黑盒。本项目的目标，是**亲手实现一个最小但完整的 coding agent harness 内核**，并在其中的"治理（Governance / Guardrails）"维度做到深入：护栏是纯代码机制、可脱离真实 LLM 进行确定性测试。

### 1.2 目标用户

- **课程评审者**：需要看到 harneess 内核、mock-LLM 确定性测试、机制演示，以判定"机制是否为代码"。
- **真实场景下的使用者**：希望在自己的代码库上运行一个受管制的 coding agent——它能读写文件、执行命令、跑测试，但危险动作被拦截、需人工审批（HITL），且一切行为被记录。
- **学习者**：想理解"当 LLM 能完成大部分思考时，工程师的价值落在 harness 这层工程"。

### 1.3 为什么值得做

- 六维机制（决策/工具/记忆/治理/反馈/配置）每一个都是可编码、可测试的工程问题。
- 治理维度有最清晰的形态：危险动作拦截不需要 LLM 的智能，而需要一个确定性的代码函数——这使"机制 = 代码"这一判据最容易被严格验证。
- 它是一个"用一个 harness（Superpowers）去造另一个 harness"的项目，能第一手检验 harness 方法论。

---

## 2. 用户故事（INVEST）

| # | 用户故事 | INVEST 验证 |
|---|---------|-------------|
| US-1 | 作为使用者，我运行 `rampart run "修复 src/a.ts 中的类型错误"`，期待 harness 能自主循环：组织上下文 → 调用 LLM → 读写文件/跑命令 → 按测试反馈自我修正，直到完成或达到步数上限。 | Independent / Negotiable / Valuable |
| US-2 | 作为使用者，当 agent 试图执行危险命令（如 `rm -rf`、`sudo`、`git push --force`）时，我期待它被护栏**立即拦截**（block/deny 级硬拦截），且我看到明确的拦截理由。 | Valuable / Small |
| US-3 | 作为使用者，当 agent 试图执行"需要人工确认"的动作（如 `git push`、`npm publish`）时，我期待它**暂停等待我的 y/n 审批**，我拒绝后它不得执行，并收到该动作未执行的反馈。 | Testable / Small |
| US-4 | 作为使用者，我期待 agent 的一切文件写入都被限制在工作区内；试图写到 `/usr`、`~/secret` 等越界路径的动作被拦截。 | Small / Estimable |
| US-5 | 作为使用者，我首次运行后输入 API key，期待它被安全存入 macOS Keychain，而不是明文散落在源码、Git、shell history 或日志里；我还能随时查看状态（不回显明文）/更新/清除。 | Independent / Valuable |
| US-6 | 作为使用者，当 agent 的一次动作导致测试失败时，我期待 loop 收到客观的 `fail` 信号，并据此改变下一步动作（而非盲目继续）。 | Valuable / Estimable |
| US-7 | 作为使用者，我通过 `harness.config.json` 声明护栏规则（哪些命令拦/批/放）、工具白名单、循环步数上限，让 agent 行为可配置、可预测。 | Small / Negotiable |
| US-8 | 作为使用者，在一次会话中断后，我期待 agent 能按需读取记忆（历史决策与约定），而不是把全部历史塞进上下文。 | Small / Estimable |

---

## 3. 功能规约（按模块）

### 3.1 模块总览

| 模块 | 职责 | 目录 |
|------|------|------|
| 主循环 loop | 上下文构建 → LLM → 解析 → 乘着护栏分发 → 反馈 → 停机判断 | `src/loop/` |
| LLM 抽象 llm | 可注入的 LLM 接口；OpenAI-compatible 实现 + MockLLM | `src/llm/` |
| 动作模型 actions | 动作判别联合类型与工具注册表 | `src/actions/` |
| 治理 guardrail | 护栏规则引擎 + HITL 状态机 + 沙箱执行器（**核心贡献**） | `src/guardrail/` |
| 反馈 feedback | 测试运行器 + 判定解析器 | `src/feedback/` |
| 记忆 memory | JSON 存储 + 按需检索 | `src/memory/` |
| 配置 config | 声明式配置加载与校验 | `src/config/` |
| CLI cli | 命令行入口、setup、HITL 交互 | `src/cli/` |

### 3.2 主循环 loop

- **输入**：任务描述、配置、工作区路径、LLM 客户端（真实或 mock）。
- **行为**：
  1. 初始化会话记忆与状态
  2. 循环直至停机条件：
     a. 构建上下文（系统提示 + 任务 + 记忆 + 前几步的观测）
     b. 调用 LLM 获得一步响应
     c. 解析响应为 `Action`
     d. 经护栏（guardrail pipeline）判定
     e. 放行 → 执行工具；拦截/待批 → 记入观测
     f. 若为测试/校验动作 → 运行反馈校验，把判定回灌
     g. 记录观测与记忆，步数 +1
  3. 停机判断
- **输出**：会话记录（结构化）、最终状态。
- **停机条件**（下列任一满足即退出）：
  1. 达到 `loop.maxSteps` 步数上限；
  2. LLM 输出 `stop` 动作；
  3. LLM 输出一段无可执行动作的"完成"声明（如 `{"tool":"done","answer":...}` 或 `{"action":"finished"}`）；
  4. 会话超过 `loop.sessionTimeout`；
  5. 循环内发生不可恢复的致命错误（仅当错误无法用失败观测继续时）。
- **边界**：步数上限、超时、循环内抛错不中断循环（转为失败观测继续，除非致命）。
- **错误处理**：LLM 调用失败 → 重试（带退避）或记失败；动作解析失败 → 归为 `malformed_action` 观测并继续；护栏对未知命令默认策略见 §4。

### 3.3 LLM 抽象 llm

- **接口** `LLMClient`：`send(Messages, tools?) → Response`（一组消息进、一条文本/结构化回复出）。
- **实现 1** `OpenAILLMClient`：调用 OpenAI-compatible Chat Completions 端点（`baseURL` + `apiKey` + `model` 可配），获得 `choices[0].message`。
- **实现 2** `MockLLMClient`：由脚本化的回复序列驱动（`replies: string[]` 或按 next-decision 函数的产出），供离线测试与机制演示使用。
- **边界**：网络错误、非 200 响应、超时。
- **错误处理**：抛出 `LLMError` 由 loop 捕获。

### 3.4 动作模型 actions

- 动作判别联合类型：

```ts
type Action =
  | { id; kind: "read_file"; path }
  | { id; kind: "write_file"; path; content }
  | { id; kind: "list_dir"; path }
  | { id; kind: "run_command"; command; timeout? }
  | { id; kind: "run_tests"; command?; cwd? }
  | { id; kind: "note"; text }        // 记忆写入
  | { id; kind: "stop"; reason? }
  | { id; kind: "malformed"; raw }    // 非法输出，不进护栏
```

- 解析器 `parseResponse(text)`：支持 JSON（`{"tool": ..., "args": ...}`）与轻量文本协议，两种都产出 Action。无法解析 → `malformed`。
- 工具注册表：`kind → execute(env) → ToolResult`，`ToolResult = { ok: boolean; output: string; exitCode? }`。

### 3.5 治理 guardrail —— **核心贡献**

#### 3.5.1 判定

对每个动作输出一个 `GuardrailVerdict`：

```ts
type VerdictKind = "allow" | "deny" | "approve" | "block";
interface Verdict {
  kind: VerdictKind;
  reason: string;          // 人类可读的拦截/审批理由
  ruleId?: string;         // 命中规则的 id，便于配置定位
}
```

判定语义（明确区分 `block` 与 `deny` 两种"拒绝"）：
- `allow` —— 直接执行。
- `approve` —— 暂停，走 HITL 人工审批。
- `deny` —— **常规拒绝**（默认策略下未列入白名单的命令），无人工放行路径。
- `block` —— **危险硬拦截**（命中 deny 规则如 `rm -rf`，或路径逃逸），比 `deny` 语义更强：用于日志/演示标注"危险动作被拦截"。

#### 3.5.2 流水线（顺序固定，短路返回）

1. **规则注入**：从配置加载规则表（也可编程追加）。
2. **路径围栏检查**（针对 `read_file`/`write_file`/`list_dir`）：
   - 解析绝对路径，确认位于工作区根目录内（排除 `..` 穿越、路径规范化）。
   - **符号链接穿透检查**：目标若经软链接指向工作区外 → `block`。
   - 工作区之外 → `block`；工作区内 → 继续。
3. **命令规则检查**（针对 `run_command`/`run_tests`）：
   - 将命令解析为 token 序列（处理引号、管道、后台符的最小 shell 词法）。
   - 遍历规则表（`deny-rules` / `approve-rules` / `allow-rules`），按模式匹配：
     - `deny` 命中 → `block`（硬拦截，如 `rm -rf`、`sudo`、`mkfs`、`dd` 对块设备）
     - `approve` 命中 → 进入 HITL（如 `git push`、`npm publish`）
     - `allow` 命中 → `allow`
   - 规则为**结构化 token 匹配**而非子串包含：`rm -rf` 是"命令 `rm` + 标志 `-rf`"；`rm single-file`（无 `-r`）不被拦。
4. **默认策略（未命中任何规则）**：`run_command` 默认 **deny**（deny-by-default），除非进入 allow 白名单；`read_file`/`list_dir` 默认 allow（在工作区内）；`note`/`stop`/`malformed` 不适用护栏。

#### 3.5.3 HITL 状态机

```
PENDING(带超时) → APPROVED → 执行
                → REJECTED → 不执行，观测记 "action_rejected"
                → EXPIRED(超时) → 按配置判定为 REJECTED 或 BLOCKED
```

- 抽象 `Approver` 接口：`requestApproval(action, verdict, session) → Promise<'approved'|'rejected'>`。
- **CLI 实现**：stderr 打印拦截信息与理由，stdin 读 `y`/`n`，支持 `!`（本次会话记住放行，写入会话临时记忆）。
- **测试实现**：`InMemoryApprover`，预置结果队列，供单测确定性驱动。

#### 3.5.4 沙箱执行器

- `SandboxExecutor.run(command, { cwd, pathAllowlist, timeout })`：
  - `cwd` 强制落在工作区内；逃逸路径（`..` / 软链接）拒绝执行。
  - `PATH` 白名单（配置声明的可执行目录）。
  - 超时到后 `SIGKILL` 子树并报 `timeout`。
  - 捕获 stdout/stderr/exitCode 作为工具结果回灌。
- 文件工具（读写）走同一沙箱：写入前校验目标路径仍在工作区内。

### 3.6 反馈 feedback

- `TestRunner.run(command, cwd, timeout) → { stdout; stderr; exitCode }`。
- `VerdictParser.parse({ exitCode, stdout, stderr }) → VerdictSignal = "pass" | "fail" | "unresolved"`：
  - `exitCode === 0` → 可选再匹配成功标志（如 `passed`）→ `pass`
  - `exitCode !== 0` → `fail`（附失败摘要行）
  - 命令找不到 / 超时 → `unresolved`
- 反馈信号作为 `Observations` 回灌 loop；loop 在上下文中呈现上一步测试判定，驱动下一步决策。

### 3.7 记忆 memory

- **存储**：`session.json`（每会话一个）——实体为 `Entry { id, type, tags, content, ts }`；长期记忆 `memory.json` 跨会话。
- **写入**：`note` 动作与关键决策。
- **读取**：`retrieve({ tags?, limit })`——按标签过滤 + 最近 N 条，**按需加载**而非全量。
- **容量控制**：上下文只嵌入检索结果，防止超长。

### 3.8 配置 config

- `harness.config.json`（默认 `{cwd}/harness.config.json`，可 `-c` 指定）：
  - `workspace` 根目录
  - `llm: { provider, baseURL, model, timeout }`
  - `tools: { enabled: [read_file, write_file, list_dir, run_command, run_tests, note, stop] }`
  - `guardrail: { deny, approve, allow 规则表；pathAllowlist; defaultPolicyForSpawn: "deny" }`
  - `loop: { maxSteps, actionTimeout, sessionTimeout }`
  - `feedback: { testCommand; successPattern; }`
  - `memory: { sessionFile; memoryFile; maxContextEntries }`
- 校验：未知键/非法值报错并拒绝启动。

---

## 4. 非功能需求

### 4.1 性能
- 单动作执行：mock LLM 下整体循环可在一秒内完成一轮（分钟级以内完成演示）。
- 上下文只加载检索后的记忆条目，不加载全库。

### 4.2 安全（含凭据威胁模型）

**凭据：**
- API key **仅在** macOS Keychain 中以 `generic-password` 存放（`service: rampart`, `account: llm`）。
- 绝不写入源码、Git（含历史）、日志、shell history、明文配置文件。
- `.env` 可选兜底，README 标明明文风险（进程环境可见）。
- 进程内：仅构造 LLM 请求时持有 key，用完即释放；日志绝不回显。

**威胁模型：**
| 威胁 | 对策 |
|------|------|
| key 泄漏进 Git | `.gitignore` 排除 `.env`/`.keychain` 转储；CI 不注入密钥；`npm pack`/发布不含密钥 |
| key 泄漏进日志 | CLI 日志层过滤 key 模式；请求/响应窥视不打印 authorization |
| 未授权读取 Keychain | 依赖 macOS Keychain 的 ACL；status 命令不回显明文 |
| 恶意命令逃逸 | 沙箱（cwd 限制 + PATH 白名单 + 超时）+ 护栏路径/命令规则 + 默认 deny |
| 符号链接绕过围栏 | 沙箱执行前解析软链接，指向工作区外即 block |
| MITM 窃取 key | 强制 HTTPS endpoint；README 警示不配 HTTP |

### 4.3 可用性
- `rampart --help` / `rampart run --help` 清晰说明用法。
- 拦截/审批信息印到 stderr，输出 vs 日志分离，便于脚本使用。
- 错误信息含可操作建议（如"加 --force 覆盖审批"）。

### 4.4 可观测性
- 结构化会话日志：每步记录 `stepIdx`、`action`、`guardrailVerdict`、`observation`、`feedbackSignal`。
- 会话结束输出摘要（步数、拦截数、审批数、最终状态）。

---

## 5. 系统架构

### 5.1 组件图

```
            ┌──────────────────────────────┐
 User/Caller│             CLI              │
            └──────────────┬───────────────┘
                           │ task / config / approver
            ┌──────────────▼───────────────┐
            │          agent-loop          │  ← 主循环状态机
            │  context → LLM → parse → guard│
            │        → dispatch → feedback │
            └──┬────┬────┬────┬────┬────┬──┘
               │    │    │    │    │    │
   llm-client  │ memory │ actions │ guardrail │ feedback │ config
       │       │    │    │    │    │    │
  OpenAI/Mock   │    │    │    │  HITL │ TestRunner
               │    │    │    │  Sandbox
               │    │    │    │
            (对一个真实目录执行读写/命令)
```

### 5.2 数据流

```
run(task) → context(系统提示+任务+记忆+历史观测)
         → LLM 输出文字
         → parseResponse → Action
         → 若 run_command/run_tests: guardrail(action) → verdict
              block → 拦截观测返回 loop
              approve → Approver 批准/拒绝 → 拒绝则记 rejected
         → dispatch → execute(action) → ToolResult
         → 若测试类动作: TestRunner + VerdictParser → signal
         → observation 记录 → 回灌上下文 → 步数+1 → halt? → 结束
```

### 5.3 外部依赖

| 依赖 | 用途 | 说明 |
|------|------|------|
| OpenAI-compatible LLM 端点 | 真实推理 | 可配 baseURL/model；默认 OpenAI |
| macOS Keychain（`security` CLI） | 凭据存储 | 目标发行平台为 macOS |
| Node.js ≥ 22 运行时 | 执行 | 原生 ESM + TS 类型剥离 |
| shell（`/bin/sh` 等） | 执行命令 | 沙箱 cwd/PATH 限制 |

---

## 6. 数据模型

### 6.1 Action
```ts
{ id: string; kind: "read_file"|"write_file"|"list_dir"|"run_command"|"run_tests"|"note"|"stop"|"malformed"; ... }
```

### 6.2 GuardrailVerdict
```ts
{ kind: "allow"|"deny"|"approve"|"block"; reason: string; ruleId?: string }
```

### 6.3 Observation（会话观测）
```ts
{ step: number; action: Action; verdict?: GuardrailVerdict; result?: ToolResult; feedback?: VerdictSignal }
```

### 6.4 Memory Entry
```ts
{ id: string; type: "convention"|"decision"|"command"|"observation"; tags: string[]; content: string; ts: string }
```

### 6.5 Config
见 §3.8 字段表。

约束：`workspace` 必须存在；`maxSteps` ≥ 1；时间非负；规则表中 `deny`/`approve`/`allow` 无交集歧义（文档要求按优先序 deny > approve > allow）。

---

## 7. 凭据与分发设计

### 7.1 凭据

- **存储方案**：macOS Keychain generic-password，仅本机可解锁。
- **录入**：`rampart setup` → 隐藏输入 → 写入 Keychain（`security add-generic-password -U`）。
- **查看状态**：`rampart status` 只显示"已配置 / 未配置"，**不回显** key。
- **更新**：`rampart setup --update` 覆盖。
- **清除**：`rampart clear` 从 Keychain 删除。
- **何时读取**：启动 LLM 会话前从 Keychain 读取，使用后不再持有。
- **未配置时的行为**：`run` 报友好错误并提示执行 `rampart setup`。

### 7.2 分发

- **形态**：npm 包（`rampart-cli`，全局可执行 `rampart`）。
- **获取/运行**：`npm install -g rampart-cli`；`rampart run "任务"`。README 写明。
- **目标机器 key 配置**：安装后执行 `rampart setup` 安全录入。
- **已知限制**：原生 Keychain 支持仅 macOS；Node ≥ 22；Windows/Linux 上引导用户改存经主密码的加密文件（文档标注）。
- **CI**：`npm ci && npm test` 每 push 运行；发布仓库在 tag 后 `npm publish` 前置测试。

---

## 8. 技术选型与理由

| 项 | 选择 | 理由 |
|----|------|------|
| 语言 | TypeScript (Node ≥ 22) | 原生 TS 类型剥离，零构建即可运行 + 单测；环境已装 Node 24 |
| 测试 | node:test（内置） | 零依赖、`node --test` 一键运行；`make test`/`npm test` |
| LLM 供应商 | OpenAI-compatible | 开放、可自托管、mock 替换接口一致 |
| 分发 | npm 包 | 环境无 Docker；README 一条命令安装；CI 可发布 |
| 凭据 | macOS Keychain | 本机 macOS；避免明文 |
| 前端 | 无（纯 CLI） | 本项目为 coding harness，无 UI，按规则豁免 Open Design |

**核心依赖尽量为 0**：LLM 调用用 Node 原生 `fetch`；不引入 agent 编排框架（满足 §A.4 不自带 agent loop 的要求）。

---

## 9. 领域与机制设计（A 类项目额外要求）

### 9.1 编码领域的四类机制映射

| 机制类别 | 本项目形态 |
|---------|-----------|
| 反馈信号 | `run_tests` 动作 → `TestRunner` 执行 → `VerdictParser` 解析为客观 pass/fail/unresolved → 回灌 loop（§3.6） |
| 危险动作 | `rm -rf`/`sudo`/`mkfs`/`dd` 块设备/越界写入/越界符号链接 → `block`；`git push`/`npm publish` → `approve`（§3.5） |
| 所需工具 | 读写文件、列目录、执行命令、跑测试、记忆注记（§3.4） |
| 记忆需求 | 项目约定/历史决策/会话观测，按标签+限量按需检索（§3.7） |

### 9.2 重点维度：治理（Guardrails），以及为什么

治理是最"必须编码"的维度：拦截一个动作不需要 LLM 的智能，而需要一个确定性的代码函数。移除 LLM 后，`guardrail(Action(command="rm -rf /"))` 依旧每次都返回 block、可以用断言测试——这最直接地满足 §A.4 的硬判据，且能体现最多的工程深度（规则引擎 + 沙箱 + HITL 状态机三层）。

### 9.3 机制的代码化实现（呼应 §A.4）

| 内容 | 代码实现 | 测试性 |
|------|---------|--------|
| 规则引擎 | `GuardrailPipeline` 纯函数，配置驱动 + 结构化 token 匹配 | 无 LLM 可测 |
| 危险拦截 | `guardrail(action) → Verdict` | `assert(verdict.kind === "block")` |
| HITL | `Approver` 接口 + `HITLState` 状态机 + CLI/内存实现 | 内存实现确定性可测 |
| 沙箱 | `SandboxExecutor`（cwd/PATH/超时/软链接） | 执行无害命令断言 |
| 反馈回灌 | `VerdictParser` + loop 观测注入 | mock 输出即可测 |
| 停机 | loop 的 halt 条件（maxSteps/stop/完成） | 借助 mock 脚本断言退出 |

---

## 10. 验收标准（每功能"完成"的客观判定）

| 模块 | 验收标准 |
|------|---------|
| 主循环 | mock LLM 脚本驱动下：一步动作被解析并执行；观测被回灌；按停机条件退出；`make test` 绿 |
| LLM 抽象 | `LLMClient` 接口存在两实现；mock 实现可被注入且不触网 |
| 动作模型 | `parseResponse` 对 JSON 与文本协议均产出正确 Action；非法输入 → `malformed` |
| 路径围栏 | 构造越界 write → block；软链接穿透 → block；工作区内 write → allow |
| 命令护栏 | `rm -rf` → block；`rm file` → allow；`git push --force` → approve；`git push` → allow |
| HITL | approve("y") → 执行；reject("n") → 不执行且记 rejected；超时 → 按配置拒绝 |
| 沙箱 | 逃逸 cwd (`cd ..`) → 拒绝；超时命令被 kill；stdout/exitCode 正确捕获 |
| 反馈 | 失败命令 → fail；成功命令 → pass；命令不存在 → unresolved；loop 收到信号并改变下一步 |
| 记忆 | `note` 写入；retrieve 按 tag+limit 只返回需要条目；跨会话文件持久化 |
| 配置 | 合法配置生效；非法配置拒绝启动 |
| 凭据 | 本机 Keychain 录入/查看状态/更新/清除均可用；`run` 未配置时报指引错误；仓库/日志无明文 key |
| 分发 | `npm install -g` 后 `rampart --help` 可运行；README 写清获取/运行/key 配置/限制 |
| CI | `.github/workflows/ci.yml`：push 触发 `npm ci && npm test` 并上报状态 |
| 机制演示 | `npm run demo` 在 mock LLM 下确定性复现：① 护栏拦截危险动作 ② 失败→反馈→下一步改变 ③ 治理梯度行为 |
| 冷启动 | 陌生 agent 仅凭 SPEC+PLAN 实现 1–2 个 task 的产物与预期差距记录在 SPEC_PROCESS.md |

---

## 11. 风险与未决问题

| 风险/未决 | 影响 | 缓解 |
|-----------|------|------|
| LLM 输出的动作解析不稳定 | 真实 LLM 下解析失败率高 | 支持 JSON+文本双协议；malformed 不中断循环 |
| Node 22 的 TS 类型剥离对部分语法不支持 | 偶发无法运行 | 只用支持的 TS 子集；`tsc --noEmit` 类型检查在 CI |
| 符号链接/路径逃逸复杂 | 沙箱被绕过 | 重点单测覆盖；默认 deny |
| HITL 超时在无人值守场景悬挂 | 会话挂起 | 超时→拒绝+记录；文档说明 |
| npm 包名占用 | 发布受阻 | 包名可改；README 提供本地安装替代（`npm link`） |
| 真实 LLM 需用户自备 key | 演示受限 | 全部机制演示用 mock；真实 LLM 需一次 `rampart setup` |