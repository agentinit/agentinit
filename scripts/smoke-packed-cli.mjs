#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliSmoke } from './smoke-cli.mjs';

const tempDir = mkdtempSync(join(tmpdir(), 'agentinit-pack-'));

try {
  const packOutput = execFileSync('npm', ['pack', '--pack-destination', tempDir, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [packResult] = JSON.parse(packOutput);
  const tarballPath = join(tempDir, packResult.filename);

  const projectDir = join(tempDir, 'project');
  mkdirSync(projectDir);
  writeFileSync(join(projectDir, 'package.json'), '{"private":true,"type":"module"}\n');

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], {
    cwd: projectDir,
    stdio: 'inherit',
  });

  const binName = process.platform === 'win32' ? 'agentinit.cmd' : 'agentinit';
  const cliPath = join(projectDir, 'node_modules', '.bin', binName);
  runCliSmoke(cliPath);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
