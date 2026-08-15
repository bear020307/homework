import test from "node:test";
import assert from "node:assert/strict";
import { runDemo } from "./demo.ts";

test("demo reproduces guardrail intercept, feedback-driven correction, and governance gradient", { timeout: 60000 }, async () => {
  const report = await runDemo();
  assert.equal(report.guardrailBlocked, true);
  assert.equal(report.feedbackChangedNextAction, true);
  assert.equal(report.governanceGradient, true);
});