import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { removeManagedIgnoreBlock, updateManagedIgnoreFile } from '../../src/core/gitignoreManager.js';

describe('gitignoreManager', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createProjectDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'agentinit-gitignore-'));
    tempDirs.push(dir);
    return dir;
  }

  it('creates and updates a managed ignore block without duplicating markers', async () => {
    const projectDir = await createProjectDir();
    const gitignorePath = join(projectDir, '.gitignore');
    await writeFile(gitignorePath, 'node_modules\n', 'utf8');

    await updateManagedIgnoreFile(projectDir, [
      join(projectDir, 'CLAUDE.md'),
      join(projectDir, '.agentinit/backups/'),
      join(projectDir, 'CLAUDE.md'),
    ]);

    await updateManagedIgnoreFile(projectDir, [
      join(projectDir, '.clinerules'),
    ]);

    const content = await readFile(gitignorePath, 'utf8');

    expect(content.match(/# START AgentInit Generated Files/g)).toHaveLength(1);
    expect(content).toContain('node_modules');
    expect(content).toContain('/.clinerules');
    expect(content).not.toContain('/CLAUDE.md');
    expect(content).not.toContain('/.agentinit/backups/');
  });

  it('removes the managed block while preserving unrelated ignore entries', async () => {
    const projectDir = await createProjectDir();
    const gitignorePath = join(projectDir, '.gitignore');
    await writeFile(
      gitignorePath,
      'node_modules\n\n# START AgentInit Generated Files\n/CLAUDE.md\n# END AgentInit Generated Files\n',
      'utf8',
    );

    const removed = await removeManagedIgnoreBlock(projectDir);
    const content = await readFile(gitignorePath, 'utf8');

    expect(removed).toBe(true);
    expect(content).toBe('node_modules\n');
  });
});
