#!/usr/bin/env node
import { main } from "../src/cli/index.ts";
main().then((code) => { process.exitCode = code; }).catch((e) => {
  console.error(e.message ?? String(e));
  process.exitCode = 1;
});