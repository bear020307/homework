const DROPPED_CHARS = /[|&;<>()$`]/g;
const QUOTED_ARG = /"([^"]*)"|'([^']*)'|([^\s]+)/g;

export function tokenizeShell(cmd: string): string[] {
  const tokens: string[] = [];
  const cleaned = cmd.replace(DROPPED_CHARS, " ");
  let m: RegExpExecArray | null;
  while ((m = QUOTED_ARG.exec(cleaned)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}