import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ManagedStateStore } from '../../src/core/managedState.js';
import { applyProjectSkills } from '../../src/core/projectSkills.js';

describe('applyProjectSkills', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createProjectDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'agentinit-project-skills-'));
    tempDirs.push(dir);
    return dir;
  }

  async function createSkill(baseDir: string, name: string, description: string): Promise<void> {
    await mkdir(baseDir, { recursive: true });
    await writeFile(
      join(baseDir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`,
      'utf8',
    );
  }

  it('installs project-owned skills for supported targets and dedupes shared directories', async () => {
    const projectDir = await createProjectDir();
    await createSkill(join(projectDir, '.agentinit/skills/shared-skill'), 'shared-skill', 'Shared skill');
    await createSkill(join(projectDir, 'skills/roo-skill'), 'roo-skill', 'Roo skill');
    await createSkill(join(projectDir, 'skills/shared-skill-copy'), 'shared-skill', 'Duplicate by name');

    const managedState = await ManagedStateStore.open(projectDir);
    const result = await applyProjectSkills(projectDir, ['claude', 'copilot', 'roo', 'aider'], managedState);

    expect(result.discovered).toBe(2);
    expect(result.sources).toEqual([
      join(projectDir, '.agentinit/skills'),
      join(projectDir, 'skills'),
    ]);
    expect(result.installed).toHaveLength(6);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every(entry => entry.reason === 'Aider does not support skills')).toBe(true);

    expect(await readFile(join(projectDir, '.claude/skills/shared-skill/SKILL.md'), 'utf8')).toContain('name: shared-skill');
    expect(await readFile(join(projectDir, '.claude/skills/roo-skill/SKILL.md'), 'utf8')).toContain('name: roo-skill');
    expect(await readFile(join(projectDir, '.agents/skills/shared-skill/SKILL.md'), 'utf8')).toContain('name: shared-skill');
    expect(await readFile(join(projectDir, '.agents/skills/roo-skill/SKILL.md'), 'utf8')).toContain('name: roo-skill');

    expect(managedState.getEntries()).toHaveLength(4);
    expect(managedState.getIgnorePaths()).toEqual(expect.arrayContaining([
      '.agentinit/backups/',
      '.agentinit/managed-state.json',
      '.claude/skills/',
      '.agents/skills/',
    ]));
  });
});
