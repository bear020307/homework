const DROPPED_CHARS = /[|&;<>$`]/g;
const QUOTED_ARG = /"([^"]*)"|'([^']*)'|([^\s]+)/g;

export function tokenizeShell(cmd: string): string[] {
  const tokens: string[] = [];
  const cleaned = cmd.replace(DROPPED_CHARS, " ");
  let m = QUOTED_ARG.exec(cleaned);
  while (m !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
    m = QUOTED_ARG.exec(cleaned);
  }
  return tokens;
}

export function normalizeTokens(tokens: string[]): string[] {
  return tokens.map((t) => {
    const withoutPath = t.includes("/") ? t.slice(t.lastIndexOf("/") + 1) : t;
    return withoutPath === "" ? t : withoutPath;
  });
}