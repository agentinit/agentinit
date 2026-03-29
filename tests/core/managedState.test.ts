import { describe, it, expect, afterEach } from 'vitest';
import { access, lstat, mkdtemp, mkdir, readFile, readlink, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ManagedStateStore } from '../../src/core/managedState.js';

describe('ManagedStateStore', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createProjectDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'agentinit-managed-state-'));
    tempDirs.push(dir);
    return dir;
  }

  it('does not create .agentinit when opening an empty store', async () => {
    const projectDir = await createProjectDir();

    await ManagedStateStore.open(projectDir);

    await expect(access(join(projectDir, '.agentinit'))).rejects.toThrow();
  });

  it('restores pre-existing generated files from backups during revert', async () => {
    const projectDir = await createProjectDir();
    const rulesPath = join(projectDir, 'CLAUDE.md');
    await writeFile(rulesPath, 'original rules\n', 'utf8');

    const store = await ManagedStateStore.open(projectDir);
    await store.trackGeneratedPath(rulesPath, {
      kind: 'file',
      source: 'sync',
      ignorePath: rulesPath,
    });
    await writeFile(rulesPath, 'generated rules\n', 'utf8');
    await store.save();

    const summary = await store.revertAll();

    expect(summary).toEqual({
      restored: 1,
      removed: 0,
      backupsRemoved: 1,
    });
    expect(await readFile(rulesPath, 'utf8')).toBe('original rules\n');
  });

  it('removes newly generated skill directories during revert', async () => {
    const projectDir = await createProjectDir();
    const skillDir = join(projectDir, '.claude/skills/project-skill');

    const store = await ManagedStateStore.open(projectDir);
    await store.trackGeneratedPath(skillDir, {
      kind: 'directory',
      source: 'skills',
      ignorePath: join(projectDir, '.claude/skills/'),
    });
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), 'name: project-skill\n', 'utf8');
    await store.save();

    const summary = await store.revertAll();

    expect(summary).toEqual({
      restored: 0,
      removed: 1,
      backupsRemoved: 0,
    });
    await expect(readFile(join(skillDir, 'SKILL.md'), 'utf8')).rejects.toThrow();
    expect(store.getEntries()).toEqual([]);
    await expect(access(join(projectDir, '.agentinit'))).rejects.toThrow();
  });

  it('restores pre-existing symlinks during revert', async () => {
    const projectDir = await createProjectDir();
    const agentsPath = join(projectDir, 'AGENTS.md');
    const claudePath = join(projectDir, 'CLAUDE.md');

    await writeFile(agentsPath, 'shared rules\n', 'utf8');
    await symlink('AGENTS.md', claudePath);

    const store = await ManagedStateStore.open(projectDir);
    await store.trackGeneratedPath(claudePath, {
      kind: 'file',
      source: 'sync',
      ignorePath: claudePath,
    });

    await rm(claudePath, { force: true });
    await writeFile(claudePath, 'generated rules\n', 'utf8');
    await store.save();

    const summary = await store.revertAll();

    expect(summary).toEqual({
      restored: 1,
      removed: 0,
      backupsRemoved: 0,
    });
    expect((await lstat(claudePath)).isSymbolicLink()).toBe(true);
    expect(await readlink(claudePath)).toBe('AGENTS.md');
  });
});
