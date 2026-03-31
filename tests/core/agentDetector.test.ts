import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AgentDetector } from '../../src/core/agentDetector.js';

describe('AgentDetector', () => {
  const originalHome = process.env.HOME;
  let homeDir: string;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'agent-detector-'));
    process.env.HOME = homeDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    await rm(homeDir, { recursive: true, force: true });
  });

  it('ignores OpenClaw when only project signals should be considered', async () => {
    const detector = new AgentDetector();
    await mkdir(join(homeDir, '.openclaw'), { recursive: true });

    const detected = await detector.detectAgentByName('/tmp/project', 'openclaw');

    expect(detected).not.toBeNull();
    expect(detected?.detected).toBe(false);
  });

  it('detects OpenClaw from ~/.openclaw when environment signals are included', async () => {
    const detector = new AgentDetector();
    await mkdir(join(homeDir, '.openclaw'), { recursive: true });

    const detected = await detector.detectAgentByName('/tmp/project', 'openclaw', {
      includeEnvironment: true,
    });

    expect(detected).not.toBeNull();
    expect(detected?.detected).toBe(true);
    expect(detected?.configPath).toBe(join(homeDir, '.openclaw'));
  });

  it('ignores Hermes when only project signals should be considered', async () => {
    const detector = new AgentDetector();
    await mkdir(join(homeDir, '.hermes'), { recursive: true });

    const detected = await detector.detectAgentByName('/tmp/project', 'hermes');

    expect(detected).not.toBeNull();
    expect(detected?.detected).toBe(false);
  });

  it('detects Hermes from ~/.hermes when environment signals are included', async () => {
    const detector = new AgentDetector();
    await mkdir(join(homeDir, '.hermes'), { recursive: true });

    const detected = await detector.detectAgentByName('/tmp/project', 'hermes', {
      includeEnvironment: true,
    });

    expect(detected).not.toBeNull();
    expect(detected?.detected).toBe(true);
    expect(detected?.configPath).toBe(join(homeDir, '.hermes'));
  });
});
