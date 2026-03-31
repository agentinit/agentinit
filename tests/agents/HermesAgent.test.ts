import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { HermesAgent } from '../../src/agents/HermesAgent.js';

describe('HermesAgent', () => {
  const originalHome = process.env.HOME;
  let homeDir: string;
  let agent: HermesAgent;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'hermes-agent-'));
    process.env.HOME = homeDir;
    agent = new HermesAgent();
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    await rm(homeDir, { recursive: true, force: true });
  });

  it('initializes as a skills-only agent', () => {
    expect(agent.id).toBe('hermes');
    expect(agent.name).toBe('Hermes');
    expect(agent.capabilities.skills).toBe(true);
    expect(agent.capabilities.rules).toBe(false);
    expect(agent.capabilities.commands).toBe(false);
    expect(agent.capabilities.hooks).toBe(false);
    expect(agent.capabilities.subagents).toBe(false);
    expect(agent.capabilities.mcp.stdio).toBe(false);
    expect(agent.capabilities.mcp.http).toBe(false);
    expect(agent.capabilities.mcp.sse).toBe(false);
  });

  it('detects presence from ~/.hermes', async () => {
    const hermesHome = join(homeDir, '.hermes');
    await mkdir(hermesHome, { recursive: true });

    const result = await agent.detectPresence('/tmp/project');

    expect(result).not.toBeNull();
    expect(result?.agent).toBe(agent);
    expect(result?.configPath).toBe(hermesHome);
  });

  it('returns null when ~/.hermes is absent', async () => {
    await expect(agent.detectPresence('/tmp/project')).resolves.toBeNull();
  });

  it('returns the shared project skills dir and dedicated global skills dir', () => {
    expect(agent.getSkillsDir('/tmp/project')).toBe(resolve('/tmp/project', '.agents/skills/'));
    expect(agent.getSkillsDir('/tmp/project', true)).toBe(join(homeDir, '.hermes/skills/'));
  });
});
