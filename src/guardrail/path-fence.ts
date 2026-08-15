import { resolve, relative, isAbsolute, dirname, join } from "node:path";
import { realpathSync, existsSync } from "node:fs";

function realize(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    let dir = dirname(p);
    while (dir !== dirname(dir)) {
      if (existsSync(dir)) return join(realpathSync(dir), relative(dir, p));
      dir = dirname(dir);
    }
    return resolve(p);
  }
}

export function isWithinWorkspace(absPath: string, workspace: string): boolean {
  const w = realize(workspace);
  const p = realize(resolve(absPath));
  const rel = relative(w, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveInsideWorkspace(p: string, workspace: string): string | null {
  const abs = resolve(workspace, p);
  if (!isWithinWorkspace(abs, workspace)) return null;
  return abs;
}