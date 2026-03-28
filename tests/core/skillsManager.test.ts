import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
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
});
