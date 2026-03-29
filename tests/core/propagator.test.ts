import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AgentDetector } from '../../src/core/agentDetector.js';
import { Propagator } from '../../src/core/propagator.js';

describe('Propagator target resolution', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createProjectDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'agentinit-propagator-'));
    tempDirs.push(dir);
    return dir;
  }

  it('does not detect Copilot from a shared AGENTS.md file', async () => {
    const projectDir = await createProjectDir();
    await writeFile(join(projectDir, 'AGENTS.md'), '# Shared agent instructions\n', 'utf8');

    const detector = new AgentDetector();
    const detected = await detector.detectAgentByName(projectDir, 'copilot');

    expect(detected?.detected).toBe(false);
  });

  it('does not detect Aider from a shared .mcp.json file', async () => {
    const projectDir = await createProjectDir();
    await writeFile(join(projectDir, '.mcp.json'), '{\"mcpServers\":{}}\n', 'utf8');

    const detector = new AgentDetector();
    const detected = await detector.detectAgentByName(projectDir, 'aider');

    expect(detected?.detected).toBe(false);
  });

  it('falls back to default targets when only shared config files exist', async () => {
    const projectDir = await createProjectDir();
    await writeFile(join(projectDir, 'agents.md'), '# Agent Configuration\n\n## General\n- Shared instructions\n', 'utf8');
    await writeFile(join(projectDir, '.mcp.json'), '{\"mcpServers\":{}}\n', 'utf8');

    const propagator = new Propagator();
    const result = await propagator.syncAgentsFile(projectDir, { dryRun: true });
    const changedFiles = result.changes.map(change => change.file);
    const claudePath = join(projectDir, 'CLAUDE.md');
    const agentsPath = join(projectDir, 'AGENTS.md');

    expect(result.success).toBe(true);
    expect(result.resolvedTargets).toEqual(['claude', 'cursor']);
    expect(changedFiles).toContain(claudePath);
    expect(changedFiles.every(file => file === claudePath || file === agentsPath)).toBe(true);
    await expect(readFile(join(projectDir, '.aider.conf.yml'), 'utf8')).rejects.toThrow();
  });
});
