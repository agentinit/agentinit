#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const packageSpec = process.argv[2] ?? 'agentinit@latest';
const attempts = Number(process.env.AGENTINIT_CANARY_ATTEMPTS ?? 6);
const delayMs = Number(process.env.AGENTINIT_CANARY_DELAY_MS ?? 10000);
const canaryCommands = [
  ['--version'],
  ['agent', 'list', '--json'],
  ['agent', 'list', 'claude', '--json'],
];

const runners = [
  ['npx', ['-y', packageSpec]],
  ['bunx', [packageSpec]],
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

for (const [runner, runnerArgs] of runners) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`Running ${runner} published canary, attempt ${attempt}/${attempts}`);

      for (const args of canaryCommands) {
        execFileSync(runner, [...runnerArgs, ...args], { stdio: 'inherit' });
      }

      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(delayMs);
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
}
