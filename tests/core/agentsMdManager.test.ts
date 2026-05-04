import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AgentsMdManager } from '../../src/core/agentsMdManager.js';

describe('AgentsMdManager', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createProjectDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'agentinit-agents-md-'));
    tempDirs.push(dir);
    return dir;
  }

  it('updates a section without dropping frontmatter or preamble text', async () => {
    const projectDir = await createProjectDir();
    await writeFile(
      join(projectDir, 'AGENTS.md'),
      [
        '---',
        'owner: platform',
        '---',
        'Keep this introduction.',
        '',
        '## Existing',
        'Old body',
        '',
        '## Keep',
        'Keep body',
        '',
      ].join('\n'),
      'utf8',
    );

    await new AgentsMdManager(projectDir).setSection({
      heading: 'Existing',
      body: 'New body',
    });

    await expect(readFile(join(projectDir, 'AGENTS.md'), 'utf8')).resolves.toBe([
      '---',
      'owner: platform',
      '---',
      'Keep this introduction.',
      '',
      '## Existing',
      'New body',
      '',
      '## Keep',
      'Keep body',
      '',
    ].join('\n'));
  });

  it('appends a section while preserving files with no markdown headings', async () => {
    const projectDir = await createProjectDir();
    await writeFile(join(projectDir, 'AGENTS.md'), 'Plain instructions only.\n', 'utf8');

    await new AgentsMdManager(projectDir).setSection({
      heading: 'New Section',
      body: 'New body',
    });

    await expect(readFile(join(projectDir, 'AGENTS.md'), 'utf8')).resolves.toBe([
      'Plain instructions only.',
      '',
      '## New Section',
      'New body',
      '',
    ].join('\n'));
  });

  it('removes a section without dropping unrelated content', async () => {
    const projectDir = await createProjectDir();
    await writeFile(
      join(projectDir, 'AGENTS.md'),
      [
        'Intro stays.',
        '',
        '## Remove',
        'Remove body',
        '',
        '## Keep',
        'Keep body',
        '',
      ].join('\n'),
      'utf8',
    );

    const removed = await new AgentsMdManager(projectDir).removeSection({ heading: 'Remove' });

    expect(removed).toBe(true);
    await expect(readFile(join(projectDir, 'AGENTS.md'), 'utf8')).resolves.toBe([
      'Intro stays.',
      '',
      '## Keep',
      'Keep body',
      '',
    ].join('\n'));
  });
});
