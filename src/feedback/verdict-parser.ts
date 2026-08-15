export type VerdictSignal = "pass" | "fail" | "unresolved";

export interface ParseInput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function parseVerdict(input: ParseInput, successPattern?: RegExp): VerdictSignal {
  if (input.exitCode === null) return "unresolved";
  if (input.exitCode === 0) {
    if (successPattern && !successPattern.test(input.stdout + input.stderr)) return "unresolved";
    return "pass";
  }
  return "fail";
}