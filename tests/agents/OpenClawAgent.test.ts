import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { OpenClawAgent } from '../../src/agents/OpenClawAgent.js';

describe('OpenClawAgent', () => {
  const originalHome = process.env.HOME;
  let homeDir: string;
  let agent: OpenClawAgent;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'openclaw-agent-'));
    process.env.HOME = homeDir;
    agent = new OpenClawAgent();
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
    expect(agent.id).toBe('openclaw');
    expect(agent.name).toBe('OpenClaw');
    expect(agent.capabilities.skills).toBe(true);
    expect(agent.capabilities.rules).toBe(false);
    expect(agent.capabilities.commands).toBe(false);
    expect(agent.capabilities.hooks).toBe(false);
    expect(agent.capabilities.subagents).toBe(false);
    expect(agent.capabilities.mcp.stdio).toBe(false);
    expect(agent.capabilities.mcp.http).toBe(false);
    expect(agent.capabilities.mcp.sse).toBe(false);
  });

  it('detects presence from ~/.openclaw', async () => {
    const openClawHome = join(homeDir, '.openclaw');
    await mkdir(openClawHome, { recursive: true });

    const result = await agent.detectPresence('/tmp/project');

    expect(result).not.toBeNull();
    expect(result?.agent).toBe(agent);
    expect(result?.configPath).toBe(openClawHome);
  });

  it('returns null when ~/.openclaw is absent', async () => {
    await expect(agent.detectPresence('/tmp/project')).resolves.toBeNull();
  });

  it('returns the shared project skills dir and dedicated global skills dir', () => {
    expect(agent.getSkillsDir('/tmp/project')).toBe(resolve('/tmp/project', '.agents/skills/'));
    expect(agent.getSkillsDir('/tmp/project', true)).toBe(join(homeDir, '.openclaw/skills/'));
  });
});
