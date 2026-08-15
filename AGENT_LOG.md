# AGENT_LOG.md —— 实施日志

> 按时间顺序记录每个 task：触发技能、关键决策、subagent/commit、人工修订、教训。
> 说明：本仓库由单人开发。代码实现采用两种形态：冷启动验证（陌生 subagent）与主会话直接实现（多数 task）。所有 `commit` 均在 git 中可追溯。

---

## 阶段 0：Brainstorming / 规约（无代码）

| # | 时间 | 内容 | 产物 |
|---|------|------|------|
| 1 | 2026-08-15 | 使用 `brainstorming` 技能；5 个关键决策逐题确认（TS/Node、治理为深维度、npm 分发、OpenAI-compatible+mock、CLI-HITL+可测 API）；架构 A（纯函数核心）。 | 决策录（见 SPEC_PROCESS §2） |
| 2 | 2026-08-15 | 设计分 4 节呈现并逐节获批。 | 设计纪要 |
| 3 | 2026-08-15 | 撰写 `SPEC.md`（408 行）并自审：补 `block` vs `deny` 语义、停机条件枚举。 | commit `b3711db` |
| 4 | 2026-08-15 | 撰写 `PLAN.md`（18 task）。 | commit `249b4fa` |

## 阶段 1：冷启动验证（陌生 subagent）

| # | 内容 | 结果与教训 |
|---|------|-----------|
| 5 | 陌生 `general` subagent（全新 session、无历史）仅凭 SPEC+PLAN 实现 Task 2。 | 0 次提问；提交 `429fc86`；8 tests pass；报告 5 处 spec 缺陷。**教训：不提问≠没猜测，靠人与 PLAN 的 diff 找缺口。** |
| 6 | 按缺陷修订 SPEC/PLAN，重写 parse 去强转。 | SPEC_PROCESS §4.3/§4.4 记录 diff；提交 `83b055d`。 |

## 阶段 2：主会话逐 task 实现（TDD）

| Task | commit | 关键实现 | 测试 | 人工修订/偏离（相对 PLAN） |
|------|--------|----------|------|---------------------------|
| Task 1 脚手架 | `12d91b2` | package.json/tsconfig/Makefile/bin/CLI 占位/smoke | 1 | `npm test` 用 glob `"src/**/*.test.ts"`（Node 直接跑目录会当 module）。 |
| Task 3 LLM 抽象 | `3a57568` | LLMClient 接口、MockLLMClient、OpenAILLMClient | 5 | **PLAN 缺陷**：strip-only 模式不支持参数属性（`constructor(private ...)`）→ 显式字段。tsconfig 无 scaffold 先落库属依赖倒置，接受。 |
| Task 4 配置系统 | `3a57568` | defaultConfig/validateConfig/loadConfig + ConfigError | 6 | 无偏离。 |
| Task 5 shell/规则 | `bbf29f5` | 分词（丢弃 `|&;<>()$` 后按引号分词）；连续子序列匹配 | 9 | 无偏离。 |
| Task 6 护栏流水线 | `bbf29f5` | 路径围栏 resolveInsideWorkspace + 四级判定流水线 | 12+6 | **PLAN 缺陷(修复)**：macOS `/var`→`/private/var` 软链致工作区自比较失败 → 对最深已存在祖先做 realpath 后再比较；构造函数应接收完整 `HarnessConfig`（与测试签名一致）；参数属性改字段。 |
| Task 7 HITL | `daf7413` | Approver 接口、InMemoryApprover、HITLState（超时→expired） | 5 | **PLAN 缺陷**：`expire` 测试原写法用空队列 approver（立即返回 rejected）永远命中不了超时；改为真实挂起 approver。 |
| Task 8 沙箱 | `daf7413` | cwd 围栏 + PATH 白名单 + 超时 SIGKILL | 4 | 参数属性改字段；cwd 逃逸立即 ok=false。 |
| Task 9 反馈闭环 | `07c95bd` | parseVerdict + TestRunner | 6 | **PLAN 缺陷**：`#private` 方法不被 erasableSyntaxOnly 支持 → 私有方法+字段。 |
| Task 10 记忆 | `07c95bd` | MemoryStore JSON 持久化、tag/limit 检索、最新优先 | 4 | 同上（参数属性）。 |
| Task 11 工具分发 | `07c95bd` | makeExecutor 8 类动作分发 | 5 | 无偏离。 |
| Task 12 主循环 | `325625c` + `48e3b47` + `7d6b18c` | AgentLoop：上下文→LLM→护栏→HITL→执行→反馈→停机 | 6 | **PLAN 缺陷(3)**：① 测试用 `enum`（strip-only 不支持）→ 计数器；② 反馈测试的 `node -e ...` 非白名单会被默认 deny，永远观察不到 feedback → 改用白名单 `node --test fail.test.mjs`；③ **环境坑**：父测试运行器注 `NODE_TEST_CONTEXT` 进子进程 env，使内层 `node --test` 被当嵌套运行器而 exit 0（误判 pass）→ `SandboxExecutor.childEnv()` 剥离该变量。 |
| Task 13 Keychain | `6de9a89` | security CLI 包装 + 可注入 exec | 5 | 无偏离。 |
| Task 14 CLI | `6de9a89` | run/setup/status/clear + createCliApprover + readHidden | 1 | **PLAN 缺陷**：GuardrailPipeline 接收完整 config（对齐 Task 6 修复）。CLI help 冒烟通过。 |
| Task 15 机制演示 | `2ba790d` | runDemo() 覆盖 §A.6 三项机制 | 1 | **PLAN 缺陷(2)**：① 反馈演示同样不能非白名单命令，改 `node --test` 实败文件；② ESM 主入口守卫用 `fileURLToPath+resolve` 对齐相对 `argv[1]`。 |
| Task 16 CI | `2ba790d` | `.github/workflows/ci.yml`（npm ci + typecheck + test） | — | 本地 `npm link` 装箱（见阶段 3）。 |
| Task 17 交付文档 | 本文档等 | README/AGENT_LOG/SPEC_PROCESS/REFLECTION | — | REFLECTION 由学生本人撰写（课程 §6），此处为模板。 |
| Task 18 收尾 | 见 PLAN.md 尾部 | 全量验证 + PLAN 勾选 | 83 pass | 另见阶段 4 评审。 |

---

## 阶段 3：分发验证

- `npm link` 全局装箱 → `rampart help` 打印 USAGE（本机验证 npm bin 路径正确）。
- `npm test` / `npm run typecheck` / `npm run demo` 三次全量验证均在最新 commit 上通过。

## 阶段 4：代码评审与合并

- 全额 83 用例、`tsc --noEmit`、demo 三项 PASS 后，按 Superpowers 评审纪律进行两阶段评审（self-review diff + 面向 final 的审查），随后合并回 `main` 并保留 worktree/分支记录（`git worktree list`）。

## 阶段 5：GitHub（待办，用户跟进）

- 尚未创建公开 GitHub 仓库。规划：为每个 feature worktree 分支开 PR，合并入 `main`；CI 将首次在 push/PR 时运行。**需要用户提供 GitHub 仓库（或授权创建空仓库）后推送。**

---

## 主要教训汇总

1. **规约颗粒度决定 subagent 下限**：Task 2 冷启动零提问完成，但 5 个缺口全是"文档与代码字面差异"，只能靠 diff 发现 → 类型签名精确性优先。
2. **Node strip-only 是硬约束**：参数属性、`enum`、`#private` 方法全部不可用，已据 `erasableSyntaxOnly` 全部改写成显式形式。PLAN 多处代码需迁移（也是 PLAN 修订的一部分）。
3. **测试环境污染是真实 bug 源**：`NODE_TEST_CONTEXT` 泄漏导致反馈信号误判，属于"测试进真实环境"反模式；沙箱必须净化子进程 env。
4. **白名单语义与测试设计冲突**："测试反馈"必须用能被治理放行的命令，否则 deadlock（deny 无 feedback）。设计 demo/测试时先过一遍护栏语义。
5. **worktree 纪律有效**：主会场保持在 `main`，实现都在独立 worktree，冲突面=0，合并干净。