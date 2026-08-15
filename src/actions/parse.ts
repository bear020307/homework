import { newId, type Action } from "./types.ts";

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function malformed(raw: string): Action {
  return { id: newId(), kind: "malformed", raw };
}

function textAction(kind: Action["kind"], args: Record<string, unknown>): Action {
  return { id: newId(), kind, ...args } as Action;
}

export function parseResponse(text: string): Action {
  const t = text.trim();
  if (!t) return malformed(text);
  if (t.startsWith("{")) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      if (obj.action === "finished" || obj.status === "complete") {
        const reason = obj.reason ?? obj.answer;
        return { id: newId(), kind: "stop", reason: typeof reason === "string" ? reason : undefined };
      }
      const tool = String(obj.tool ?? "");
      switch (tool) {
        case "read_file": return textAction("read_file", { path: String(obj.path ?? "") });
        case "write_file": return textAction("write_file", { path: String(obj.path ?? ""), content: String(obj.content ?? "") });
        case "list_dir": return textAction("list_dir", { path: String(obj.path ?? "") });
        case "run_command": return textAction("run_command", { command: String(obj.command ?? ""), timeout: typeof obj.timeout === "number" ? obj.timeout : undefined });
        case "run_tests": return textAction("run_tests", { command: typeof obj.command === "string" ? obj.command : undefined, cwd: typeof obj.cwd === "string" ? obj.cwd : undefined });
        case "note": return textAction("note", { text: String(obj.text ?? ""), tags: Array.isArray(obj.tags) ? (obj.tags as unknown[]).map(String) : undefined });
        case "stop":
        case "done":
          return textAction("stop", { reason: typeof obj.reason === "string" ? obj.reason : (typeof obj.answer === "string" ? obj.answer : undefined) });
        default:
          return malformed(text);
      }
    } catch {
      return malformed(text);
    }
  }
  const forms: Array<{ re: RegExp; kind: Action["kind"]; map: (m: RegExpExecArray) => Record<string, unknown> }> = [
    { re: /^read_file\(\s*(.*?)\s*\)$/s, kind: "read_file", map: (m) => ({ path: stripQuotes(m[1]) }) },
    { re: /^write_file\(\s*(.*?)\s*\)$/s, kind: "write_file", map: (m) => ({ path: stripQuotes(m[1]), content: "" }) },
    { re: /^list_dir\(\s*(.*?)\s*\)$/s, kind: "list_dir", map: (m) => ({ path: stripQuotes(m[1]) }) },
    { re: /^run_command\(\s*(.*?)\s*\)$/s, kind: "run_command", map: (m) => ({ command: stripQuotes(m[1]) }) },
    { re: /^run_tests\(\s*(.*?)\s*\)$/s, kind: "run_tests", map: (m) => (m[1].trim() ? { command: stripQuotes(m[1]) } : {}) },
    { re: /^note\(\s*(.*?)\s*\)$/s, kind: "note", map: (m) => ({ text: stripQuotes(m[1]) }) },
    { re: /^stop\(\s*(.*?)\s*\)$/s, kind: "stop", map: (m) => (m[1].trim() ? { reason: stripQuotes(m[1]) } : {}) },
  ];
  for (const f of forms) {
    const m = f.re.exec(t);
    if (m) return textAction(f.kind, f.map(m));
  }
  return malformed(text);
}