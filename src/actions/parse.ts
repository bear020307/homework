import { newId, type Action } from "./types.ts";

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function malformed(raw: string): Action {
  return { id: newId(), kind: "malformed", raw };
}

function make(kind: Action["kind"], args: Record<string, unknown>): Action {
  switch (kind) {
    case "read_file": return { id: newId(), kind, path: String(args.path ?? "") };
    case "write_file": return { id: newId(), kind, path: String(args.path ?? ""), content: String(args.content ?? "") };
    case "list_dir": return { id: newId(), kind, path: String(args.path ?? "") };
    case "run_command": return { id: newId(), kind, command: String(args.command ?? ""), timeout: typeof args.timeout === "number" ? args.timeout : undefined };
    case "run_tests": return { id: newId(), kind, command: typeof args.command === "string" ? args.command : undefined, cwd: typeof args.cwd === "string" ? args.cwd : undefined };
    case "note": return { id: newId(), kind, text: String(args.text ?? ""), tags: Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : undefined };
    case "stop": return { id: newId(), kind, reason: typeof args.reason === "string" ? args.reason : undefined };
    case "malformed": return malformed(String(args.raw ?? ""));
  }
}

export function parseResponse(text: string): Action {
  const t = text.trim();
  if (!t) return malformed(text);
  if (t.startsWith("{")) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      if (obj.action === "finished" || obj.status === "complete") {
        const reason = obj.reason ?? obj.answer;
        return make("stop", { reason: typeof reason === "string" ? reason : "" });
      }
      const tool = String(obj.tool ?? "");
      switch (tool) {
        case "read_file": return make("read_file", { path: obj.path });
        case "write_file": return make("write_file", { path: obj.path, content: obj.content });
        case "list_dir": return make("list_dir", { path: obj.path });
        case "run_command": return make("run_command", { command: obj.command, timeout: obj.timeout });
        case "run_tests": return make("run_tests", { command: obj.command, cwd: obj.cwd });
        case "note": return make("note", { text: obj.text, tags: obj.tags });
        case "stop":
        case "done":
          return make("stop", { reason: obj.reason ?? obj.answer });
        default:
          return malformed(text);
      }
    } catch {
      return malformed(text);
    }
  }
  const forms: Array<{ re: RegExp; kind: Action["kind"]; map: (m: RegExpExecArray) => Record<string, unknown> }> = [
    { re: /^read_file\(\s*(.*?)\s*\)$/s, kind: "read_file", map: (m) => ({ path: stripQuotes(m[1]) }) },
    { re: /^list_dir\(\s*(.*?)\s*\)$/s, kind: "list_dir", map: (m) => ({ path: stripQuotes(m[1]) }) },
    { re: /^run_command\(\s*(.*?)\s*\)$/s, kind: "run_command", map: (m) => ({ command: stripQuotes(m[1]) }) },
    { re: /^run_tests\(\s*(.*?)\s*\)$/s, kind: "run_tests", map: (m) => (m[1].trim() ? { command: stripQuotes(m[1]) } : {}) },
    { re: /^note\(\s*(.*?)\s*\)$/s, kind: "note", map: (m) => ({ text: stripQuotes(m[1]) }) },
    { re: /^stop\(\s*(.*?)\s*\)$/s, kind: "stop", map: (m) => (m[1].trim() ? { reason: stripQuotes(m[1]) } : {}) },
  ];
  for (const f of forms) {
    const m = f.re.exec(t);
    if (m) return make(f.kind, f.map(m));
  }
  return malformed(text);
}