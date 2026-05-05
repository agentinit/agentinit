import { afterEach, describe, expect, it } from 'vitest';
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AgentsMdManager } from '../../src/core/agentsMdManager.js';

describe('AgentsMdManager', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createProject(): Promise<string> {
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-agents-md-'));
    tempDirs.push(projectDir);
    return projectDir;
  }

  it('updates nested sections without dropping preamble or sibling sections', async () => {
    const projectDir = await createProject();
    const agentsMdPath = join(projectDir, 'AGENTS.md');
    await writeFile(
      agentsMdPath,
      [
        '<!-- keep this preamble -->',
        '# Agent Config',
        'Intro stays.',
        '## Existing',
        'Old body stays.',
        '### Nested',
        'Old nested body.',
        '## Other',
        'Other body stays.',
        '',
      ].join('\n'),
    );

    const manager = new AgentsMdManager(projectDir);
    await manager.setSection({
      heading: 'Nested',
      body: 'New nested body.',
    });

    await expect(readFile(agentsMdPath, 'utf8')).resolves.toBe([
      '<!-- keep this preamble -->',
      '# Agent Config',
      'Intro stays.',
      '## Existing',
      'Old body stays.',
      '### Nested',
      'New nested body.',
      '## Other',
      'Other body stays.',
      '',
    ].join('\n'));
  });

  it('removes a section subtree while preserving unrelated content', async () => {
    const projectDir = await createProject();
    const agentsMdPath = join(projectDir, 'AGENTS.md');
    await writeFile(
      agentsMdPath,
      [
        '<!-- keep this preamble -->',
        '# Agent Config',
        'Intro stays.',
        '## Remove Me',
        'Remove body.',
        '### Nested',
        'Remove nested body.',
        '## Keep Me',
        'Keep body.',
        '',
      ].join('\n'),
    );

    const manager = new AgentsMdManager(projectDir);
    await expect(manager.removeSection({ heading: 'Remove Me' })).resolves.toBe(true);

    await expect(readFile(agentsMdPath, 'utf8')).resolves.toBe([
      '<!-- keep this preamble -->',
      '# Agent Config',
      'Intro stays.',
      '## Keep Me',
      'Keep body.',
      '',
    ].join('\n'));
  });

  it('refuses to overwrite an existing real CLAUDE.md when creating the alias', async () => {
    const projectDir = await createProject();
    await writeFile(join(projectDir, 'AGENTS.md'), '# Agents\n');
    await writeFile(join(projectDir, 'CLAUDE.md'), '# Claude specific rules\n');

    const manager = new AgentsMdManager(projectDir);
    await expect(manager.symlinkClaude()).rejects.toThrow('CLAUDE.md already exists');
    await expect(readFile(join(projectDir, 'CLAUDE.md'), 'utf8')).resolves.toBe('# Claude specific rules\n');
  });

  it('creates or replaces a CLAUDE.md symlink', async () => {
    const projectDir = await createProject();
    await writeFile(join(projectDir, 'AGENTS.md'), '# Agents\n');
    await writeFile(join(projectDir, 'OLD.md'), '# Old\n');
    await symlink('OLD.md', join(projectDir, 'CLAUDE.md'));

    const manager = new AgentsMdManager(projectDir);
    await manager.symlinkClaude();

    expect((await lstat(join(projectDir, 'CLAUDE.md'))).isSymbolicLink()).toBe(true);
    await expect(readFile(join(projectDir, 'CLAUDE.md'), 'utf8')).resolves.toBe('# Agents\n');
  });
});
