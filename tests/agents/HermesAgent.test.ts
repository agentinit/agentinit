import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { HermesAgent } from '../../src/agents/HermesAgent.js';
import { SkillsManager } from '../../src/core/skillsManager.js';
import { InstallLock } from '../../src/core/installLock.js';

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

  it('always returns the global skills dir regardless of requested scope', () => {
    expect(agent.getSkillsScope()).toBe('global');
    expect(agent.getSkillsScope(true)).toBe('global');
    expect(agent.getSkillsDir('/tmp/project')).toBe(join(homeDir, '.hermes/skills/'));
    expect(agent.getSkillsDir('/tmp/project', true)).toBe(join(homeDir, '.hermes/skills/'));
  });

  it('uses global canonical storage for default Hermes skill installs', async () => {
    const skillsManager = new SkillsManager();

    const plan = await skillsManager.getInstallPlan('reviewer', agent, '/tmp/project');

    expect(plan.path).toBe(join(homeDir, '.hermes/skills/reviewer'));
    expect(plan.canonicalPath).toBe(join(homeDir, '.agents/skills/reviewer'));
    expect(plan.mode).toBe('symlink');
  });

  it('lists Hermes skills once as global installs', async () => {
    const skillsDir = join(homeDir, '.hermes/skills/reviewer');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(
      join(skillsDir, 'SKILL.md'),
      '---\nname: reviewer\ndescription: Reviews code\n---\n# Reviewer\n',
      'utf8',
    );

    const skillsManager = new SkillsManager();
    const installed = await skillsManager.listInstalled('/tmp/project', {
      agents: ['hermes'],
    });

    expect(installed).toHaveLength(1);
    expect(installed[0]).toMatchObject({
      name: 'reviewer',
      agent: 'hermes',
      scope: 'global',
      path: skillsDir,
    });
  });

  it('records default Hermes skill installs as global', async () => {
    const sourceDir = join(homeDir, 'source-skill');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      join(sourceDir, 'SKILL.md'),
      '---\nname: reviewer\ndescription: Reviews code\n---\n# Reviewer\n',
      'utf8',
    );

    const skillsManager = new SkillsManager();
    const result = await skillsManager.addFromSource(sourceDir, '/tmp/project', {
      agents: ['hermes'],
      scan: false,
    });

    expect(result.installed).toHaveLength(1);
    expect(result.installed[0]).toMatchObject({
      agent: 'hermes',
      path: join(homeDir, '.hermes/skills/reviewer'),
      canonicalPath: join(homeDir, '.agents/skills/reviewer'),
    });

    const lock = new InstallLock();
    const state = await lock.load();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      name: 'reviewer',
      agents: ['hermes'],
      scope: 'global',
      projectPath: '/tmp/project',
    });
  });
});
