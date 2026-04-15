import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerLockCommand } from '../../src/commands/lock.js';
import { InstallLock } from '../../src/core/installLock.js';
import { logger } from '../../src/utils/logger.js';

describe('lock command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups global entries under a dedicated target label', async () => {
    vi.spyOn(InstallLock.prototype, 'getCurrentState').mockResolvedValue([
      {
        kind: 'skill',
        action: 'install',
        name: 'project-skill',
        projectPath: '/tmp/project-a',
        agents: ['claude'],
        scope: 'project',
        source: { type: 'github', owner: 'test', repo: 'skills' },
        metadata: {
          kind: 'skill',
          installPath: '/tmp/project-a/.claude/skills/project-skill',
          mode: 'symlink',
        },
        id: '1',
        timestamp: new Date().toISOString(),
      },
      {
        kind: 'skill',
        action: 'install',
        name: 'global-skill',
        projectPath: '/tmp/originating-project',
        agents: ['claude'],
        scope: 'global',
        source: { type: 'github', owner: 'test', repo: 'skills' },
        metadata: {
          kind: 'skill',
          installPath: '/tmp/home/.claude/skills/global-skill',
          mode: 'copy',
        },
        id: '2',
        timestamp: new Date().toISOString(),
      },
    ]);

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const program = new Command();
    registerLockCommand(program);

    await program.parseAsync(['lock', 'list'], { from: 'user' });

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('/tmp/project-a'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Global scope'));
  });

  it('reports project and global counts separately in status', async () => {
    vi.spyOn(InstallLock.prototype, 'getCurrentState').mockResolvedValue([
      {
        kind: 'skill',
        action: 'install',
        name: 'project-skill',
        projectPath: '/tmp/project-a',
        agents: ['claude'],
        scope: 'project',
        source: { type: 'github', owner: 'test', repo: 'skills' },
        metadata: {
          kind: 'skill',
          installPath: '/tmp/project-a/.claude/skills/project-skill',
          mode: 'symlink',
        },
        id: '1',
        timestamp: new Date().toISOString(),
      },
      {
        kind: 'mcp',
        action: 'install',
        name: 'global-mcp',
        projectPath: '/tmp/originating-project',
        agents: ['claude'],
        scope: 'global',
        source: { type: 'local' },
        metadata: {
          kind: 'mcp',
          configPath: '/tmp/home/.claude.json',
          serverType: 'stdio',
          command: 'npx test-mcp',
        },
        id: '2',
        timestamp: new Date().toISOString(),
      },
    ]);
    vi.spyOn(InstallLock.prototype, 'findStaleProjects').mockResolvedValue(['/tmp/stale-project']);

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const program = new Command();
    registerLockCommand(program);

    await program.parseAsync(['lock', 'status'], { from: 'user' });

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Projects:'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Global targets:'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Stale projects:'));
  });

  it('shows prune dry-run output without mutating the lock', async () => {
    vi.spyOn(InstallLock.prototype, 'findStaleProjects').mockResolvedValue(['/tmp/stale-project']);
    const pruneSpy = vi.spyOn(InstallLock.prototype, 'pruneStaleEntries').mockResolvedValue({
      prunedProjects: ['/tmp/stale-project'],
      entriesRemoved: 1,
    });
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const program = new Command();
    registerLockCommand(program);

    await program.parseAsync(['lock', 'prune', '--dry-run'], { from: 'user' });

    expect(pruneSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('Found 1 stale project(s):');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('/tmp/stale-project'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
  });
});
