import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readdir, lstat, readFile, realpath } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ClaudeAgent } from '../../src/agents/ClaudeAgent.js';
import { ClaudeDesktopAgent } from '../../src/agents/ClaudeDesktopAgent.js';
import { CodexCliAgent } from '../../src/agents/CodexCliAgent.js';
import { MarketplacePluginNotFoundError, PluginManager } from '../../src/core/pluginManager.js';
import { SkillsManager } from '../../src/core/skillsManager.js';

describe('SkillsManager', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createClaudeMarketplaceBundleDir(bundleName: string, pluginName: string = 'codex'): Promise<string> {
    const bundleDir = await mkdtemp(join(tmpdir(), `agentinit-skill-bundle-${bundleName}-`));
    tempDirs.push(bundleDir);

    await mkdir(join(bundleDir, '.claude-plugin'), { recursive: true });
    await mkdir(join(bundleDir, 'plugins', pluginName, '.claude-plugin'), { recursive: true });
    await mkdir(join(bundleDir, 'plugins', pluginName, 'commands'), { recursive: true });
    await mkdir(join(bundleDir, 'plugins', pluginName, 'agents'), { recursive: true });
    await writeFile(
      join(bundleDir, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({
        name: bundleName,
        plugins: [
          {
            name: pluginName,
            source: `./plugins/${pluginName}`,
          },
        ],
      }, null, 2),
    );
    await writeFile(
      join(bundleDir, 'plugins', pluginName, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: pluginName,
        version: '1.0.1',
        description: 'Bundled Codex plugin',
      }, null, 2),
    );
    await writeFile(
      join(bundleDir, 'plugins', pluginName, 'commands', 'review.md'),
      '---\nname: codex-review\ndescription: Review code with Codex\n---\nRun a Codex review.\n',
    );

    return bundleDir;
  }

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

  it('retains the shared native global Claude skills path even after the symlink exists', async () => {
    const originalHome = process.env.HOME;
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-src-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-home-'));
    tempDirs.push(srcDir, projectDir, homeDir);

    process.env.HOME = homeDir;

    try {
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'SKILL.md'), '---\nname: frontend-design\ndescription: test\n---\n');

      const claudeResult = await manager.installSkillForAgent(
        srcDir,
        'frontend-design',
        new ClaudeAgent(),
        projectDir,
        { global: true },
      );
      const desktopResult = await manager.installSkillForAgent(
        srcDir,
        'frontend-design',
        new ClaudeDesktopAgent(),
        projectDir,
        { global: true },
      );

      const nativePath = join(homeDir, '.claude/skills', 'frontend-design');
      const canonicalPath = join(homeDir, '.agents/skills', 'frontend-design');

      expect(claudeResult).toMatchObject({
        path: nativePath,
        canonicalPath,
        mode: 'symlink',
      });
      expect(desktopResult).toMatchObject({
        path: nativePath,
        canonicalPath,
        mode: 'symlink',
      });
      expect((await lstat(nativePath)).isSymbolicLink()).toBe(true);
      expect(await realpath(nativePath)).toBe(await realpath(canonicalPath));
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  it('skips removing a shared native global skills path while another agent still uses it', async () => {
    const originalHome = process.env.HOME;
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-src-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-home-'));
    tempDirs.push(srcDir, projectDir, homeDir);

    process.env.HOME = homeDir;

    try {
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'SKILL.md'), '---\nname: frontend-design\ndescription: test\n---\n');

      await manager.installSkillForAgent(srcDir, 'frontend-design', new ClaudeAgent(), projectDir, { global: true });
      await manager.installSkillForAgent(srcDir, 'frontend-design', new ClaudeDesktopAgent(), projectDir, { global: true });

      const nativePath = join(homeDir, '.claude/skills', 'frontend-design');
      const canonicalPath = join(homeDir, '.agents/skills', 'frontend-design');
      const result = await manager.remove(['frontend-design'], projectDir, {
        agents: ['claude'],
        global: true,
      });

      expect(result.removed).toEqual([]);
      expect(result.notFound).toEqual([]);
      expect(result.skipped[0]?.reason).toContain(nativePath);
      expect((await lstat(nativePath)).isSymbolicLink()).toBe(true);
      expect(await realpath(nativePath)).toBe(await realpath(canonicalPath));
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  it('removes a shared native global skills path when all sharing agents are targeted', async () => {
    const originalHome = process.env.HOME;
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-src-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-home-'));
    tempDirs.push(srcDir, projectDir, homeDir);

    process.env.HOME = homeDir;

    try {
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'SKILL.md'), '---\nname: frontend-design\ndescription: test\n---\n');

      await manager.installSkillForAgent(srcDir, 'frontend-design', new ClaudeAgent(), projectDir, { global: true });
      await manager.installSkillForAgent(srcDir, 'frontend-design', new ClaudeDesktopAgent(), projectDir, { global: true });

      const nativePath = join(homeDir, '.claude/skills', 'frontend-design');
      const canonicalPath = join(homeDir, '.agents/skills', 'frontend-design');
      const result = await manager.remove(['frontend-design'], projectDir, {
        agents: ['claude', 'claude-desktop'],
        global: true,
      });

      expect(result).toEqual({
        removed: ['claude:frontend-design', 'claude-desktop:frontend-design'],
        notFound: [],
        skipped: [],
      });
      await expect(lstat(nativePath)).rejects.toThrow();
      await expect(lstat(canonicalPath)).rejects.toThrow();
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
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
        agents: ['claude', 'claude-desktop'],
      });

      expect(projectResult).toEqual({
        removed: ['claude:scoped-skill', 'claude-desktop:scoped-skill'],
        notFound: [],
        skipped: [],
      });
      await expect(lstat(projectPath)).rejects.toThrow();
      expect(await readFile(join(globalPath, 'SKILL.md'), 'utf8')).toContain('name: scoped-skill');

      const globalResult = await manager.remove(['scoped-skill'], projectDir, {
        agents: ['claude', 'claude-desktop'],
        global: true,
      });

      expect(globalResult).toEqual({
        removed: ['claude:scoped-skill', 'claude-desktop:scoped-skill'],
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

  it('supports explicit marketplace sources for skills installs', async () => {
    const manager = new SkillsManager();
    const srcDir = await mkdtemp(join(tmpdir(), 'agentinit-marketplace-skill-src-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-marketplace-skill-project-'));
    tempDirs.push(srcDir, projectDir);

    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '---\nname: skill-creator\ndescription: test\n---\n');

    const installPluginSpy = vi.spyOn(PluginManager.prototype, 'installPlugin').mockResolvedValue({
      plugin: {
        name: 'skill-creator',
        version: '1.0.0',
        description: 'Skill creator',
        source: { type: 'marketplace', marketplace: 'claude', pluginName: 'skill-creator' },
        format: 'claude',
        skills: [{ name: 'skill-creator', description: 'test', path: srcDir }],
        mcpServers: [],
        warnings: [],
      },
      skills: { installed: [], skipped: [] },
      mcpServers: { applied: [], skipped: [] },
      warnings: [],
    } as never);

    const result = await manager.addFromSource('skill-creator', projectDir, {
      from: 'claude',
      agents: ['claude'],
    });

    expect(installPluginSpy).toHaveBeenCalledWith('skill-creator', projectDir, {
      from: 'claude',
      list: true,
    });
    expect(result.warnings).toEqual([]);
    expect(result.installed).toHaveLength(1);
    expect(result.installed[0]).toMatchObject({
      agent: 'claude',
      mode: 'symlink',
      path: join(projectDir, '.claude/skills', 'skill-creator'),
      canonicalPath: join(projectDir, '.agents/skills', 'skill-creator'),
    });
    expect((await lstat(join(projectDir, '.claude/skills', 'skill-creator'))).isSymbolicLink()).toBe(true);
  });

  it('supports repo fallback for --from openai skill installs', async () => {
    const manager = new SkillsManager();
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-marketplace-skill-project-'));
    const bundleDir = await createClaudeMarketplaceBundleDir('openai-codex');
    tempDirs.push(projectDir);

    vi.spyOn(PluginManager.prototype, 'resolveMarketplacePlugin').mockRejectedValueOnce(
      new MarketplacePluginNotFoundError('codex-plugin-cc', 'openai', 'OpenAI Skills', []),
    );
    const cloneRepoSpy = vi.spyOn(SkillsManager.prototype, 'cloneRepo').mockResolvedValue(bundleDir);

    const result = await manager.addFromSource('codex-plugin-cc', projectDir, {
      from: 'openai',
      agents: ['claude'],
    });

    expect(cloneRepoSpy).toHaveBeenCalledWith('https://github.com/openai/codex-plugin-cc.git');
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Plugin "codex-plugin-cc" not found in OpenAI Skills marketplace.',
      'Marketplace lookup failed; trying unverified GitHub repository https://github.com/openai/codex-plugin-cc instead.',
      'Source "https://github.com/openai/codex-plugin-cc" is a Claude Code marketplace bundle; using bundled plugin "codex".',
      'Agent definitions (agents/) are Claude Code-specific',
    ]));
    expect(result.installed).toHaveLength(1);
    expect(result.installed[0]).toMatchObject({
      agent: 'claude',
      mode: 'symlink',
      path: join(projectDir, '.claude/skills', 'codex-review'),
      canonicalPath: join(projectDir, '.agents/skills', 'codex-review'),
    });
  });

  it('does not auto-target OpenClaw from a home-directory marker alone', async () => {
    const originalHome = process.env.HOME;
    const manager = new SkillsManager();
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-home-'));
    tempDirs.push(projectDir, homeDir);

    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, '.openclaw'), { recursive: true });

      const targets = await manager.getTargetAgents(projectDir, {});

      expect(targets).toEqual([]);
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  it('resolves bare skill names from the default public skills catalog', async () => {
    const manager = new SkillsManager();
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    const repoDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-catalog-'));
    tempDirs.push(projectDir, repoDir);

    await mkdir(join(repoDir, 'skills', 'skill-creator'), { recursive: true });
    await mkdir(join(repoDir, 'skills', 'other-skill'), { recursive: true });
    await writeFile(join(repoDir, 'skills', 'skill-creator', 'SKILL.md'), '---\nname: skill-creator\ndescription: test\n---\n');
    await writeFile(join(repoDir, 'skills', 'other-skill', 'SKILL.md'), '---\nname: other-skill\ndescription: other\n---\n');

    const cloneRepoSpy = vi.spyOn(manager, 'cloneRepo').mockResolvedValue(repoDir);
    const result = await manager.discoverFromSource('skill-creator', projectDir);

    expect(cloneRepoSpy).toHaveBeenCalledWith('https://github.com/vercel-labs/agent-skills.git');
    expect(result.skills).toEqual([
      {
        name: 'skill-creator',
        description: 'test',
        path: join(repoDir, 'skills', 'skill-creator'),
      },
    ]);
    expect(result.warnings[0]).toContain('vercel-labs/agent-skills');
    expect(result.warnings[0]).toContain('Use "./skill-creator" for a local path.');
  });

  it('discovers skills from direct GitHub Claude marketplace bundles', async () => {
    const manager = new SkillsManager();
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    const bundleDir = await createClaudeMarketplaceBundleDir('openai-codex');
    tempDirs.push(projectDir);

    vi.spyOn(manager, 'cloneRepo').mockResolvedValue(bundleDir);

    const result = await manager.discoverFromSource('https://github.com/openai/codex-plugin-cc', projectDir);

    expect(result.skills).toEqual([
      expect.objectContaining({
        name: 'codex-review',
        description: 'Review code with Codex',
      }),
    ]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Source "https://github.com/openai/codex-plugin-cc" is a Claude Code marketplace bundle; using bundled plugin "codex".',
      'Agent definitions (agents/) are Claude Code-specific',
    ]));
  });

  it('keeps explicit local paths for missing skills', async () => {
    const manager = new SkillsManager();
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-skill-project-'));
    tempDirs.push(projectDir);
    const missingPath = join(projectDir, 'skill-creator');

    await expect(manager.discoverFromSource(missingPath, projectDir)).rejects.toThrow(
      `Local path not found: ${missingPath}`
    );
  });
});
