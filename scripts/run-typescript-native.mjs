#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve('@typescript/native/package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const compilerPath = resolve(dirname(packageJsonPath), packageJson.bin.tsc);

const compiler = spawn(process.execPath, [compilerPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => compiler.kill(signal));
}

compiler.once('error', (error) => {
  console.error(`Failed to start TypeScript 7: ${error.message}`);
  process.exitCode = 1;
});

compiler.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
