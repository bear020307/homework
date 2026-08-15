import { randomUUID } from "node:crypto";

export type ActionKind =
  | "read_file" | "write_file" | "list_dir"
  | "run_command" | "run_tests"
  | "note" | "stop" | "malformed";

export type Action =
  | { id: string; kind: "read_file"; path: string }
  | { id: string; kind: "write_file"; path: string; content: string }
  | { id: string; kind: "list_dir"; path: string }
  | { id: string; kind: "run_command"; command: string; timeout?: number }
  | { id: string; kind: "run_tests"; command?: string; cwd?: string }
  | { id: string; kind: "note"; text: string; tags?: string[] }
  | { id: string; kind: "stop"; reason?: string }
  | { id: string; kind: "malformed"; raw: string };

export function newId(): string { return randomUUID(); }