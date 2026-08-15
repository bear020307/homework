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
  let calls = 0;
  const llm = new MockLLMClient({
    respond: (msgs) => {
      const ctx = msgs.map((m) => m.content).join("\n");
      if (calls === 0) {
        calls += 1;
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
  assert.equal(r.observations[r.observations.length - 1].action.kind, "stop");
});