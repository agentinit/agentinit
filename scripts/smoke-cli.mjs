#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const smokeCommands = [
  ['init', '--help'],
  ['detect', '--help'],
  ['sync', '--help'],
  ['apply', '--help'],
  ['revert', '--help'],
  ['verify_mcp', '--help'],
  ['skills', '--help'],
  ['mcp', '--help'],
  ['rules', '--help'],
  ['plugins', '--help'],
  ['config', '--help'],
  ['lock', '--help'],
  ['agent', '--help'],
  ['agent', 'list', '--json'],
  ['agent', 'list', 'claude', '--json'],
];

function assertCliVersion(cliPath) {
  const expectedVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const actualVersion = runCli(cliPath, ['--version'], 'pipe').trim();

  if (actualVersion !== expectedVersion) {
    throw new Error(`CLI version mismatch: expected ${expectedVersion}, got ${actualVersion}`);
  }

  console.log(actualVersion);
}

function runCli(cliPath, args, stdio = 'inherit') {
  if (cliPath.endsWith('.js')) {
    return execFileSync(process.execPath, [cliPath, ...args], {
      encoding: 'utf8',
      stdio,
    });
  }

  return execFileSync(cliPath, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio,
  });
}

export function runCliSmoke(cliPath) {
  assertCliVersion(cliPath);

  for (const args of smokeCommands) {
    runCli(cliPath, args);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCliSmoke(process.argv[2] ?? 'dist/cli.js');
}
