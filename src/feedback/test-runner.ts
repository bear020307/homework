import type { SandboxExecutor } from "../guardrail/sandbox.ts";
import type { ParseInput } from "./verdict-parser.ts";

export class TestRunner {
  private sandbox: SandboxExecutor;
  private defaultTimeoutMs: number;
  constructor(sandbox: SandboxExecutor, defaultTimeoutMs: number) {
    this.sandbox = sandbox;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async run(command: string, cwd?: string): Promise<ParseInput> {
    const r = await this.sandbox.run(command, { cwd, timeoutMs: this.defaultTimeoutMs });
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
  }
}