#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const packageSpec = process.argv[2] ?? 'agentinit@latest';
const packageName = 'agentinit';
const expectedVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const attempts = Number(process.env.AGENTINIT_CANARY_ATTEMPTS ?? 18);
const delayMs = Number(process.env.AGENTINIT_CANARY_DELAY_MS ?? 10000);
const canaryCommands = [
  ['--version'],
  ['agent', 'list', '--json'],
  ['agent', 'list', 'claude', '--json'],
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function npmView(spec, field) {
  return execFileSync('npm', ['view', spec, field], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

async function waitForPublishedPackage() {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const latestVersion = npmView(`${packageName}@latest`, 'version');
      const exactVersion = npmView(`${packageName}@${expectedVersion}`, 'version');

      if (latestVersion === expectedVersion && exactVersion === expectedVersion) {
        return `${packageName}@${expectedVersion}`;
      }

      throw new Error(`Expected ${packageName}@latest to be ${expectedVersion}, got ${latestVersion}; exact resolved as ${exactVersion}.`);
    } catch (error) {
      lastError = error;
      console.log(`Waiting for npm registry, attempt ${attempt}/${attempts}: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < attempts) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

const resolvedPackageSpec = packageSpec === `${packageName}@latest`
  ? await waitForPublishedPackage()
  : packageSpec;

const runners = [
  ['npx', ['-y', '--package', resolvedPackageSpec, packageName]],
  ['bunx', [resolvedPackageSpec]],
];

const canaryCwd = mkdtempSync(join(tmpdir(), 'agentinit-published-canary-'));

try {
  for (const [runner, runnerArgs] of runners) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        console.log(`Running ${runner} published canary, attempt ${attempt}/${attempts}`);

        for (const args of canaryCommands) {
          execFileSync(runner, [...runnerArgs, ...args], {
            cwd: canaryCwd,
            stdio: 'inherit',
          });
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
} finally {
  rmSync(canaryCwd, { recursive: true, force: true });
}
