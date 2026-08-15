# Rampart — 受治理护栏约束的编码 Agent Harness

> AI4SE 期末项目 A · Coding Agent Harness
> **核心主张**：Agent 的能力来自 LLM，但**治理是机制**——高原生代码、可确定性测试、可移除 LLM 验证。

Rampart 是一个**自研编码 agent 内核**：主循环、工具分发、护栏（深维度）、反馈闭环、记忆、配置全部由本项目代码实现，不依赖任何 agent 框架。任意 OpenAI-compatible 模型可作为大脑；`--mock` 模式用内置脚本 LLM 驱动，实现**离线、确定性、可复现**的机制演示。

治理护栏（重点维度）采用纯函数流水线：路径围栏 + 命令规则 + HITL 人工审批 + 沙箱执行器，四级判定 `allow / approve / deny / block`。

---

## 安装与运行

要求：Node.js ≥ 22（利用原生 TS 类型剥离，**无需构建步骤**）。

```bash
# 从源码运行
git clone <your-repo-url> rampart && cd rampart
npm install

# 全局安装（分发）
npm install -g .
rampart help
```

### 命令

```bash
rampart setup      # 安全录入 LLM API key（macOS Keychain，输入不回显）
rampart status     # 查看 key 是否已配置（绝不回显明文）
rampart clear      # 从 Keychain 删除 key
rampart run "<任务>"   # 在护栏内运行编码 agent
rampart help       # 帮助
```

### 首次使用（配置 key）

```bash
rampart setup
```

key 通过 macOS `security` CLI 写入 Keychain（generic-password），**不落在磁盘、不进 git、不进 shell 历史、不写入 session 日志**。`run` 运行时再从 Keychain 读取，仅存在于进程内存。

### 离线演示（无需任何 key）

```bash
npm run demo
# 或
rampart run --mock "演示任务"
```

`src/demo/demo.ts` 用 Mock LLM 确定性复现三项机制（见下"安全边界"与测试）。

### 配置

默认读 `./harness.config.json`（可合并到默认值，见 `src/config/config.ts` 的 `validateConfig`）。常用覆盖：

```jsonc
{
  "workspace": "/absolute/path/to/workspace",
  "llm": { "model": "gpt-4o-mini", "baseURL": "https://api.openai.com/v1" },
  "loop": { "maxSteps": 10 },
  "guardrail": { "defaultPolicyForSpawn": "deny" }
}
```

命令行选项：`-c/--config <path>`、`-w/--workspace <dir>`、`--llm-model <m>`、`--mock`。

---

## 目录结构

```
bin/rampart.js            CLI 入口（npm bin）
src/
  actions/                动作模型与双协议解析（type + JSON/文本 parse）
  loop/agent-loop.ts      主循环：上下文 → LLM → 护栏 → 分发 → 反馈 → 停机
  guardrail/              深维度·治理（核心贡献）
    guardrail.ts          护栏流水线 + Verdict 四级判定
    path-fence.ts         工作区路径围栏（.. / 软链接逃逸拦截）
    shell.ts              命令词法器（去 shell 操作符后按引号分词）
    rules.ts              连续子序列规则匹配（deny 优先级最高）
    hitl.ts               HITL 状态机 + 可注入 Approver
    sandbox.ts            沙箱执行器（cwd 围栏 + PATH 白名单 + 超时 SIGKILL）
  tools/executor.ts       工具分发（读写/列目录/命令/测试/记忆）
  feedback/               反馈闭环（TestRunner + VerdictParser）
  memory/memory.ts        按需检索的 JSON 记忆存储
  cli/                    命令分发、Keychain、HITL 终端审批、隐藏输入
  demo/demo.ts            离线确定性机制演示
  config/config.ts        声明式配置（默认规则 + 校验）
.github/workflows/ci.yml  CI：push/PR 自动 typecheck + test
```

---

## 安全边界（治理深维度的具体体现）

| 层级 | 未通过时 | 说明 |
|------|---------|------|
| 路径围栏 | `block` | `read_file / write_file / list_dir` 目标经 `..` 或软链接逃出工作区即拦截 |
| 命令规则 deny | `block` | 如 `rm -rf` / `sudo` / `mkfs` / `dd of=/dev/*` / `shutdown` |
| 命令规则 approve | `approve` | 如 `git push --force` / `npm publish`，走 HITL 人工确认 |
| 命令规则 allow | `allow` | 如 `git push` / `npm test` / `node --test` / `ls` / `cat` |
| 默认策略 | `deny` | 未列入白名单的命令一律拒绝（`defaultPolicyForSpawn: "deny"`） |
| 沙箱执行 | — | cwd 越界拒绝；PATH 白名单；超时 SIGKILL；剥离测试运行器 env |

动作一旦 `block / deny / rejected / approval_expired` 就**不会**进入执行器。`run_tests` 无命令时使用受控反馈配置；携带命令时与其他命令一视同仁地接受规则治理。

---

## 测试与验证

```bash
npm test          # node 原生测试运行器（83 用例，全部离线确定性）
npm run typecheck # tsc --noEmit（erasableSyntaxOnly / strict）
make test typecheck
```

所有测试使用 **Mock LLM / 注入假件**，零网络、零真实 LLM。治理、反馈、HITL 均有独立单元测试。

`npm run demo` 输出三项机制演示 PASS：
1. 护栏拦截危险动作（`rm -rf`）
2. 失败反馈 → 下一步行为改变（`node --test` 红灯 → agent 改判）
3. 治理梯度在同一工作区复现 `block / approve / allow` 三档

---

## 已知限制

- **平台**：Keychain 依赖 macOS `security` CLI；沙箱依赖 POSIX shell（`shell: true`）。非 macOS 请改用 config 或注入自实现凭据存储。
- **治理颗粒度**：命令规则做的是**词法连续子序列匹配**（不解析语义），子进程可再派生子进程、沙箱为同权限约束而非系统容器；适合作为课程演示的工程纵深，不等于生产级 EDR。
- **记忆**：单 JSON 文件、按 tag/limit 按需检索，无向量检索与自动精炼。
- **LLM 协议**：仅 OpenAI-compatible `chat/completions`，单一动作 JSON 或文本输出。
- **npm 分发**：`npm install -g .` 即可；发布到 registry 前需补齐 `npm publish` 前的版本/README 元数据（见 AGENT_LOG）。

---

## 第三方依赖

仅 devDependencies：`typescript`、`@types/node`（MIT）。运行时零第三方依赖，全部核心逻辑为本项目代码。无其他第三方代码入库。

---

## 文档索引

- `SPEC.md` — 设计规约
- `PLAN.md` — 18-task 实现计划与验收记录
- `SPEC_PROCESS.md` — brainstorming / 冷启动验证 / spec 修订过程证据
- `AGENT_LOG.md` — 逐 task 实施日志
- `REFLECTION.md` — 反思报告