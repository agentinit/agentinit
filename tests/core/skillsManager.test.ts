import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readdir, lstat, readFile, realpath } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ClaudeAgent } from '../../src/agents/ClaudeAgent.js';
import { CodexCliAgent } from '../../src/agents/CodexCliAgent.js';
import { SkillsManager } from '../../src/core/skillsManager.js';

describe('SkillsManager', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('should reject skill names that escape the target directory', async () => {
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-src-'));
    const targetDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-target-'));
    tempDirs.push(srcDir, targetDir);

    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '---\nname: safe\ndescription: test\n---\n');

    await expect(
      manager.installSkill(srcDir, '../../escaped-skill', join(targetDir, '.claude/skills'), true)
    ).rejects.toThrow('Invalid skill name');

    expect(await readdir(targetDir)).toEqual([]);
  });

  it('should install valid skill names inside the target directory', async () => {
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-src-'));
    const targetDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-target-'));
    tempDirs.push(srcDir, targetDir);

    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '---\nname: safe-skill\ndescription: test\n---\n');

    const installedPath = await manager.installSkill(srcDir, 'safe-skill', join(targetDir, '.claude/skills'), true);

    expect(installedPath).toBe(join(targetDir, '.claude/skills', 'safe-skill'));
  });

  it('installs skills into the canonical directory and symlinks Claude paths', async () => {
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-src-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    tempDirs.push(srcDir, projectDir);

    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '---\nname: safe-skill\ndescription: test\n---\n');

    const result = await manager.installSkillForAgent(
      srcDir,
      'safe-skill',
      new ClaudeAgent(),
      projectDir,
    );

    const canonicalPath = join(projectDir, '.agents/skills', 'safe-skill');
    const claudePath = join(projectDir, '.claude/skills', 'safe-skill');

    expect(result).toMatchObject({
      path: claudePath,
      canonicalPath,
      mode: 'symlink',
    });
    expect((await lstat(claudePath)).isSymbolicLink()).toBe(true);
    expect(await realpath(claudePath)).toBe(await realpath(canonicalPath));
    expect(await readFile(join(canonicalPath, 'SKILL.md'), 'utf8')).toContain('name: safe-skill');
  });

  it('skips removing a shared canonical path when another agent still references it', async () => {
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-src-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    tempDirs.push(srcDir, projectDir);

    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '---\nname: shared-skill\ndescription: test\n---\n');

    await manager.installSkillForAgent(srcDir, 'shared-skill', new CodexCliAgent(), projectDir);
    await manager.installSkillForAgent(srcDir, 'shared-skill', new ClaudeAgent(), projectDir);

    const canonicalPath = join(projectDir, '.agents/skills', 'shared-skill');
    const result = await manager.remove(['shared-skill'], projectDir, {
      agents: ['codex'],
    });

    expect(result.removed).toEqual([]);
    expect(result.skipped[0]?.reason).toContain(canonicalPath);
    expect(await readFile(join(canonicalPath, 'SKILL.md'), 'utf8')).toContain('name: shared-skill');
  });

  it('removes project skills by default without touching global installs', async () => {
    const originalHome = process.env.HOME;
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-src-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-home-'));
    tempDirs.push(srcDir, projectDir, homeDir);

    process.env.HOME = homeDir;

    try {
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'SKILL.md'), '---\nname: scoped-skill\ndescription: test\n---\n');

      await manager.installSkillForAgent(srcDir, 'scoped-skill', new ClaudeAgent(), projectDir, { copy: true });
      await manager.installSkillForAgent(srcDir, 'scoped-skill', new ClaudeAgent(), projectDir, {
        global: true,
        copy: true,
      });

      const projectPath = join(projectDir, '.claude/skills/scoped-skill');
      const globalPath = join(homeDir, '.claude/skills/scoped-skill');

      const projectResult = await manager.remove(['scoped-skill'], projectDir, {
        agents: ['claude'],
      });

      expect(projectResult).toEqual({
        removed: ['claude:scoped-skill'],
        notFound: [],
        skipped: [],
      });
      await expect(lstat(projectPath)).rejects.toThrow();
      expect(await readFile(join(globalPath, 'SKILL.md'), 'utf8')).toContain('name: scoped-skill');

      const globalResult = await manager.remove(['scoped-skill'], projectDir, {
        agents: ['claude'],
        global: true,
      });

      expect(globalResult).toEqual({
        removed: ['claude:scoped-skill'],
        notFound: [],
        skipped: [],
      });
      await expect(lstat(globalPath)).rejects.toThrow();
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });
});
