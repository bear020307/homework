import { createInterface } from "node:readline";
import { moveCursor, clearLine } from "node:readline";

export function readHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin as NodeJS.ReadStream;
    const onData = (chunk: Buffer) => {
      moveCursor(process.stdout, 0, -1);
      clearLine(process.stdout, 1);
      process.stdout.write(question + "*".repeat(chunk.toString().length));
    };
    if (stdin.isTTY) {
      stdin.setRawMode(true);
      stdin.on("data", onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      if (stdin.isTTY) {
        stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        try { moveCursor(process.stdout, 0, -1); clearLine(process.stdout, 1); } catch { /* ignore */ }
      }
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}