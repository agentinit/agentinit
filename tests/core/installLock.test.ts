import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import { InstallLock, hashDirectory } from '../../src/core/installLock.js';

describe('InstallLock', () => {
  const tempDirs: string[] = [];
  let originalHome: string;
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'agentinit-lock-'));
    tempDirs.push(fakeHome);
    originalHome = process.env.HOME!;
    process.env.HOME = fakeHome;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'agentinit-lock-project-'));
    tempDirs.push(dir);
    return dir;
  }

  it('loads empty state when no lockfile exists', async () => {
    const lock = new InstallLock();
    const state = await lock.load();
    expect(state.version).toBe(1);
    expect(state.entries).toEqual([]);
  });

  it('records a skill installation and persists to disk', async () => {
    const lock = new InstallLock();
    const projectPath = await createTempDir();

    const entry = await lock.recordSkill({
      action: 'install',
      name: 'test-skill',
      projectPath,
      agents: ['claude'],
      scope: 'project',
      source: { type: 'github', owner: 'test', repo: 'skills', url: 'https://github.com/test/skills.git' },
      installPath: join(projectPath, '.claude/skills/test-skill'),
      mode: 'symlink',
      contentHash: 'abc123',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.kind).toBe('skill');
    expect(entry.action).toBe('install');
    expect(entry.name).toBe('test-skill');
    expect(entry.timestamp).toBeTruthy();

    // Verify persistence
    const lockPath = join(fakeHome, '.agentinit', 'lock.json');
    const content = JSON.parse(await readFile(lockPath, 'utf8'));
    expect(content.version).toBe(1);
    expect(content.entries).toHaveLength(1);
    expect(content.entries[0].name).toBe('test-skill');
  });

  it('records MCP installation', async () => {
    const lock = new InstallLock();
    const entry = await lock.recordMcp({
      action: 'install',
      name: 'my-mcp',
      projectPath: '/tmp/project',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      configPath: '/tmp/project/.mcp.json',
      serverType: 'stdio',
      command: 'npx my-mcp',
    });

    expect(entry.kind).toBe('mcp');
    expect(entry.metadata).toEqual({
      kind: 'mcp',
      configPath: '/tmp/project/.mcp.json',
      serverType: 'stdio',
      command: 'npx my-mcp',
    });
  });

  it('records rules installation', async () => {
    const lock = new InstallLock();
    const entry = await lock.recordRules({
      action: 'install',
      name: 'git,write_tests',
      projectPath: '/tmp/project',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      configPath: '/tmp/project/CLAUDE.md',
      templateIds: ['git', 'write_tests'],
      ruleCount: 15,
    });

    expect(entry.kind).toBe('rules');
    expect(entry.metadata).toEqual({
      kind: 'rules',
      configPath: '/tmp/project/CLAUDE.md',
      templateIds: ['git', 'write_tests'],
      ruleCount: 15,
    });
  });

  it('queries entries by kind', async () => {
    const lock = new InstallLock();
    await lock.recordSkill({
      action: 'install',
      name: 'skill-a',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/skill-a',
      mode: 'symlink',
    });
    await lock.recordMcp({
      action: 'install',
      name: 'mcp-a',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      configPath: '/tmp/a/.mcp.json',
      serverType: 'stdio',
    });

    const skills = await lock.query({ kind: 'skill' });
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('skill-a');

    const mcps = await lock.query({ kind: 'mcp' });
    expect(mcps).toHaveLength(1);
    expect(mcps[0]!.name).toBe('mcp-a');
  });

  it('queries entries by project path', async () => {
    const lock = new InstallLock();
    await lock.recordSkill({
      action: 'install',
      name: 'skill-a',
      projectPath: '/tmp/project-a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/project-a/.claude/skills/skill-a',
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'install',
      name: 'skill-a',
      projectPath: '/tmp/project-b',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/project-b/.claude/skills/skill-a',
      mode: 'symlink',
    });

    const results = await lock.query({ projectPath: '/tmp/project-a' });
    expect(results).toHaveLength(1);
    expect(results[0]!.projectPath).toBe('/tmp/project-a');
  });

  it('getCurrentState collapses audit trail to latest per (kind, name, project)', async () => {
    const lock = new InstallLock();
    await lock.recordSkill({
      action: 'install',
      name: 'my-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/my-skill',
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'update',
      name: 'my-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/my-skill',
      mode: 'symlink',
    });

    const current = await lock.getCurrentState();
    expect(current).toHaveLength(1);
    expect(current[0]!.action).toBe('update');
  });

  it('getCurrentState excludes entries whose latest action is remove', async () => {
    const lock = new InstallLock();
    await lock.recordSkill({
      action: 'install',
      name: 'removed-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/removed-skill',
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'remove',
      name: 'removed-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/removed-skill',
      mode: 'symlink',
    });

    const current = await lock.getCurrentState();
    expect(current).toHaveLength(0);
  });

  it('findProjectsWithSkill returns all projects with a given skill', async () => {
    const lock = new InstallLock();
    await lock.recordSkill({
      action: 'install',
      name: 'shared-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'github', owner: 'test', repo: 'skills' },
      installPath: '/tmp/a/.claude/skills/shared-skill',
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'install',
      name: 'shared-skill',
      projectPath: '/tmp/b',
      agents: ['cursor'],
      scope: 'project',
      source: { type: 'github', owner: 'test', repo: 'skills' },
      installPath: '/tmp/b/.cursor/skills/shared-skill',
      mode: 'copy',
    });

    const entries = await lock.findProjectsWithSkill('shared-skill');
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.projectPath).sort()).toEqual(['/tmp/a', '/tmp/b']);
  });

  it('findStaleProjects detects non-existent paths', async () => {
    const lock = new InstallLock();
    const existingDir = await createTempDir();

    await lock.recordSkill({
      action: 'install',
      name: 'skill-a',
      projectPath: existingDir,
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: join(existingDir, '.claude/skills/skill-a'),
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'install',
      name: 'skill-b',
      projectPath: '/tmp/non-existent-project-xyz-12345',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/non-existent-project-xyz-12345/.claude/skills/skill-b',
      mode: 'symlink',
    });

    const stale = await lock.findStaleProjects();
    expect(stale).toEqual(['/tmp/non-existent-project-xyz-12345']);
  });

  it('pruneStaleEntries removes entries for non-existent projects', async () => {
    const lock = new InstallLock();
    const existingDir = await createTempDir();

    await lock.recordSkill({
      action: 'install',
      name: 'keep-this',
      projectPath: existingDir,
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: join(existingDir, '.claude/skills/keep-this'),
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'install',
      name: 'prune-this',
      projectPath: '/tmp/non-existent-project-xyz-12345',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/non-existent-project-xyz-12345/.claude/skills/prune-this',
      mode: 'symlink',
    });

    const result = await lock.pruneStaleEntries();
    expect(result.prunedProjects).toEqual(['/tmp/non-existent-project-xyz-12345']);
    expect(result.entriesRemoved).toBe(1);

    const remaining = await lock.getCurrentState();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.name).toBe('keep-this');
  });

  it('reloads state from disk on new instance', async () => {
    const lock1 = new InstallLock();
    await lock1.recordSkill({
      action: 'install',
      name: 'persistent-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/persistent-skill',
      mode: 'symlink',
    });

    // New instance should read from disk
    const lock2 = new InstallLock();
    const entries = await lock2.getCurrentState();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe('persistent-skill');
  });

  it('keeps separate current-state entries for the same skill installed to multiple agents', async () => {
    const lock = new InstallLock();
    await lock.recordSkill({
      action: 'install',
      name: 'shared-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/shared-skill',
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'install',
      name: 'shared-skill',
      projectPath: '/tmp/a',
      agents: ['cursor'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.cursor/skills/shared-skill',
      mode: 'symlink',
    });

    const current = await lock.getCurrentState({ kind: 'skill', name: 'shared-skill' });
    expect(current).toHaveLength(2);
    expect(current.map(entry => entry.agents[0]).sort()).toEqual(['claude', 'cursor']);
  });

  it('collapses global skill entries across originating projects into one current target', async () => {
    const lock = new InstallLock();
    await lock.recordSkill({
      action: 'install',
      name: 'shared-skill',
      projectPath: '/tmp/project-a',
      agents: ['claude'],
      scope: 'global',
      source: { type: 'github', owner: 'test', repo: 'skills' },
      installPath: join(fakeHome, '.claude', 'skills', 'shared-skill'),
      mode: 'copy',
    });
    await lock.recordSkill({
      action: 'update',
      name: 'shared-skill',
      projectPath: '/tmp/project-b',
      agents: ['claude'],
      scope: 'global',
      source: { type: 'github', owner: 'test', repo: 'skills' },
      installPath: join(fakeHome, '.claude', 'skills', 'shared-skill'),
      mode: 'copy',
    });

    const current = await lock.getCurrentState({ kind: 'skill', name: 'shared-skill' });
    expect(current).toHaveLength(1);
    expect(current[0]!.action).toBe('update');
    expect(current[0]!.projectPath).toBe('/tmp/project-b');
  });

  it('collapses global MCP and rules entries across originating projects', async () => {
    const lock = new InstallLock();
    const globalMcpPath = join(fakeHome, '.claude.json');
    const globalRulesPath = join(fakeHome, '.claude', 'CLAUDE.md');

    await lock.recordMcp({
      action: 'install',
      name: 'global-mcp',
      projectPath: '/tmp/project-a',
      agents: ['claude'],
      scope: 'global',
      source: { type: 'local' },
      configPath: globalMcpPath,
      serverType: 'stdio',
      command: 'npx test-mcp',
    });
    await lock.recordMcp({
      action: 'update',
      name: 'global-mcp',
      projectPath: '/tmp/project-b',
      agents: ['claude'],
      scope: 'global',
      source: { type: 'local' },
      configPath: globalMcpPath,
      serverType: 'stdio',
      command: 'npx test-mcp',
    });
    await lock.recordRules({
      action: 'install',
      name: 'git',
      projectPath: '/tmp/project-a',
      agents: ['claude'],
      scope: 'global',
      source: { type: 'local' },
      configPath: globalRulesPath,
      templateIds: ['git'],
      ruleCount: 3,
    });
    await lock.recordRules({
      action: 'update',
      name: 'git',
      projectPath: '/tmp/project-b',
      agents: ['claude'],
      scope: 'global',
      source: { type: 'local' },
      configPath: globalRulesPath,
      templateIds: ['git'],
      ruleCount: 4,
    });

    const mcps = await lock.getCurrentState({ kind: 'mcp', name: 'global-mcp' });
    const rules = await lock.getCurrentState({ kind: 'rules', name: 'git' });

    expect(mcps).toHaveLength(1);
    expect(mcps[0]!.action).toBe('update');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action).toBe('update');
  });

  it('removing one agent target does not hide another current install', async () => {
    const lock = new InstallLock();
    await lock.recordSkill({
      action: 'install',
      name: 'shared-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/shared-skill',
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'install',
      name: 'shared-skill',
      projectPath: '/tmp/a',
      agents: ['cursor'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.cursor/skills/shared-skill',
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'remove',
      name: 'shared-skill',
      projectPath: '/tmp/a',
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: '/tmp/a/.claude/skills/shared-skill',
      mode: 'symlink',
    });

    const current = await lock.getCurrentState({ kind: 'skill', name: 'shared-skill' });
    expect(current).toHaveLength(1);
    expect(current[0]!.agents).toEqual(['cursor']);
  });

  it('ignores global entries when finding and pruning stale projects', async () => {
    const lock = new InstallLock();
    const existingDir = await createTempDir();
    const staleProjectPath = '/tmp/non-existent-project-xyz-12345';
    const staleGlobalSourcePath = '/tmp/non-existent-global-origin-xyz-12345';

    await lock.recordSkill({
      action: 'install',
      name: 'keep-project',
      projectPath: existingDir,
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: join(existingDir, '.claude/skills/keep-project'),
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'install',
      name: 'prune-project',
      projectPath: staleProjectPath,
      agents: ['claude'],
      scope: 'project',
      source: { type: 'local' },
      installPath: join(staleProjectPath, '.claude/skills/prune-project'),
      mode: 'symlink',
    });
    await lock.recordSkill({
      action: 'install',
      name: 'keep-global',
      projectPath: staleGlobalSourcePath,
      agents: ['claude'],
      scope: 'global',
      source: { type: 'github', owner: 'test', repo: 'skills' },
      installPath: join(fakeHome, '.claude/skills/keep-global'),
      mode: 'copy',
    });

    const stale = await lock.findStaleProjects();
    expect(stale).toEqual([staleProjectPath]);

    const result = await lock.pruneStaleEntries();
    expect(result.prunedProjects).toEqual([staleProjectPath]);
    expect(result.entriesRemoved).toBe(1);

    const remaining = await lock.getCurrentState();
    expect(remaining).toHaveLength(2);
    expect(remaining.map(entry => entry.name).sort()).toEqual(['keep-global', 'keep-project']);
  });
});

describe('hashDirectory', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('returns null for non-existent paths', async () => {
    const result = await hashDirectory('/tmp/non-existent-path-xyz-99999');
    expect(result).toBeNull();
  });

  it('returns consistent hash for same content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agentinit-hash-'));
    tempDirs.push(dir);
    await writeFile(join(dir, 'SKILL.md'), '---\nname: test\n---\nContent');

    const hash1 = await hashDirectory(dir);
    const hash2 = await hashDirectory(dir);
    expect(hash1).toBe(hash2);
    expect(hash1).toBeTruthy();
  });

  it('returns different hash for different content', async () => {
    const dir1 = await mkdtemp(join(tmpdir(), 'agentinit-hash-'));
    const dir2 = await mkdtemp(join(tmpdir(), 'agentinit-hash-'));
    tempDirs.push(dir1, dir2);

    await writeFile(join(dir1, 'SKILL.md'), 'content A');
    await writeFile(join(dir2, 'SKILL.md'), 'content B');

    const hash1 = await hashDirectory(dir1);
    const hash2 = await hashDirectory(dir2);
    expect(hash1).not.toBe(hash2);
  });
});
