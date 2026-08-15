import { execFile } from "node:child_process";

export interface KeychainExecResult { code: number; stdout: string; stderr: string }
export type KeychainExec = (args: string[]) => Promise<KeychainExecResult>;

export interface KeychainCredentialStoreOptions {
  service?: string;
  account?: string;
  exec?: KeychainExec;
}

const defaultExec: KeychainExec = (args: string[]) =>
  new Promise<KeychainExecResult>((resolve) => {
    execFile("security", args, { timeout: 10_000 }, (err, stdout, stderr) => {
      resolve({
        code: err && typeof (err as { code?: number }).code === "number" ? (err as { code: number }).code : err ? 1 : 0,
        stdout,
        stderr,
      });
    });
  });

export class KeychainCredentialStore {
  private service: string;
  private account: string;
  private exec: KeychainExec;

  constructor(opts: KeychainCredentialStoreOptions = {}) {
    this.service = opts.service ?? "rampart";
    this.account = opts.account ?? "llm";
    this.exec = opts.exec ?? defaultExec;
  }

  async save(key: string): Promise<void> {
    await this.exec(["add-generic-password", "-U", "-s", this.service, "-a", this.account, "-w", key]);
  }

  async load(): Promise<string | null> {
    const r = await this.exec(["find-generic-password", "-s", this.service, "-a", this.account, "-w"]);
    if (r.code !== 0) return null;
    return r.stdout.trim() || null;
  }

  async hasKey(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async clear(): Promise<void> {
    await this.exec(["delete-generic-password", "-s", this.service, "-a", this.account]);
  }
}