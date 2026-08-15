import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

  const ws1 = join(dir, "ws1");
  mkdirSync(ws1, { recursive: true });
  const cfg1 = defaultConfig(ws1);
  const g1 = new GuardrailPipeline(ws1, cfg1);
  const v = await g1.evaluate({ id: "d1", kind: "run_command", command: "rm -rf /" });
  const guardrailBlocked = v.kind === "block";

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
      if (phase2 === 1) {
        writeFileSync(join(ws2, "fail.test.mjs"), 'import assert from "node:assert"; assert.equal(1, 2);');
        return '{"tool":"run_tests","command":"node --test fail.test.mjs"}';
      }
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

if (import.meta.url.startsWith("file:")) {
  const self = process.argv[1];
  if (self) {
    const selfPath = resolve(process.cwd(), self);
    const metaPath = fileURLToPath(import.meta.url);
    if (selfPath === metaPath) {
      runDemo().then((r) => {
        console.log("=== Rampart 机制演示 ===");
        console.log(`① 护栏拦截危险动作 (rm -rf): ${r.guardrailBlocked ? "PASS" : "FAIL"}`);
        console.log(`② 失败反馈 → 下一步改变: ${r.feedbackChangedNextAction ? "PASS" : "FAIL"}`);
        console.log(`③ 治理梯度 (block/approve/allow): ${r.governanceGradient ? "PASS" : "FAIL"}`);
        process.exitCode = r.guardrailBlocked && r.feedbackChangedNextAction && r.governanceGradient ? 0 : 1;
      });
    }
  }
}