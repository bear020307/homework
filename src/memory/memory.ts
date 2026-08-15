import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export interface MemoryEntry {
  id: string;
  type: string;
  tags: string[];
  content: string;
  ts: string;
}

export interface MemoryAddInput {
  type: string;
  tags?: string[];
  content: string;
}

export class MemoryStore {
  private filePath: string;
  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async add(input: MemoryAddInput): Promise<MemoryEntry> {
    const entries = await this.all();
    const entry: MemoryEntry = {
      id: randomUUID(),
      type: input.type,
      tags: input.tags ?? [],
      content: input.content,
      ts: new Date().toISOString(),
    };
    entries.push(entry);
    await this.save(entries);
    return entry;
  }

  async retrieve(opts?: { tags?: string[]; limit?: number }): Promise<MemoryEntry[]> {
    const entries = await this.all();
    let out = entries;
    if (opts?.tags && opts.tags.length > 0) {
      out = out.filter((e) => opts.tags!.every((t) => e.tags.includes(t)));
    }
    out = [...out].reverse();
    if (opts?.limit !== undefined) out = out.slice(0, opts.limit);
    return out;
  }

  async all(): Promise<MemoryEntry[]> {
    try {
      const text = await readFile(this.filePath, "utf8");
      const data = JSON.parse(text) as unknown;
      return Array.isArray(data) ? (data as MemoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  private async save(entries: MemoryEntry[]): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }
}