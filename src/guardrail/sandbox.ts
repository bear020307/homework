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

export class SandboxExecutor {
  private workspace: string;
  private pathAllowlist: string[];
  private defaultTimeoutMs: number;

  constructor(opts: SandboxOptions) {
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