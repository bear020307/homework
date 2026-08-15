import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveInsideWorkspace } from "../guardrail/path-fence.ts";
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
  const fence = (path: string): string => {
    const resolved = resolveInsideWorkspace(path, deps.workspace);
    if (!resolved) throw new Error(`路径越出工作区: ${path}`);
    return resolved;
  };
  return async (action: Action) => {
    try {
      switch (action.kind) {
        case "read_file": {
          const p = fence(action.path);
          return wrapOk((await readFile(p, "utf8")).toString());
        }
        case "write_file": {
          const p = fence(action.path);
          await mkdir(dirname(p), { recursive: true });
          await writeFile(p, action.content, "utf8");
          return wrapOk(`written ${p}`);
        }
        case "list_dir": {
          const p = fence(action.path);
          const names = await readdir(p);
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