import type { CommandRule } from "../config/config.ts";

export type { CommandRule } from "../config/config.ts";

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return true;
  if (needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let all = true;
    for (let k = 0; k < needle.length; k++) {
      if (haystack[i + k] !== needle[k]) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

export function matchRule(tokens: string[], rules: CommandRule[]): CommandRule | null {
  for (const rule of rules) {
    if (containsSequence(tokens, rule.tokens)) return rule;
  }
  return null;
}