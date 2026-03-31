import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Agent } from '../../src/agents/Agent.js';
import { MarketplacePluginNotFoundError, PluginManager } from '../../src/core/pluginManager.js';
import { SkillsManager } from '../../src/core/skillsManager.js';
import type { AgentDefinition } from '../../src/types/index.js';
import type { AppliedRules, RuleSection } from '../../src/types/rules.js';

class StubAgent extends Agent {
  appliedProjectMcp: string[] = [];
  appliedGlobalMcp: string[] = [];
  removedProjectMcp: string[] = [];
  removedGlobalMcp: string[] = [];

  constructor(id: string) {
    const definition: AgentDefinition = {
      id,
      name: `Stub ${id}`,
      url: 'https://example.com',
      capabilities: {
        mcp: { stdio: true, http: true, sse: true },
        rules: false,
        hooks: false,
        commands: false,
        subagents: false,
        statusline: false,
        skills: true,
      },
      configFiles: [],
      nativeConfigPath: '.stub/mcp.json',
      globalConfigPath: `~/.${id}/mcp.json`,
      skillPaths: {
        project: '.agents/skills/',
        global: `~/.${id}/skills/`,
      },
    };

    super(definition);
  }

  async applyMCPConfig(_projectPath: string, servers: Array<{ name: string }>): Promise<void> {
    this.appliedProjectMcp.push(...servers.map(server => server.name));
  }

  async applyGlobalMCPConfig(servers: Array<{ name: string }>): Promise<void> {
    this.appliedGlobalMcp.push(...servers.map(server => server.name));
  }

  async removeMCPServer(_projectPath: string, serverName: string): Promise<boolean> {
    this.removedProjectMcp.push(serverName);
    return true;
  }

  async removeGlobalMCPServer(serverName: string): Promise<boolean> {
    this.removedGlobalMcp.push(serverName);
    return true;
  }

  async applyRulesConfig(_configPath: string, _rules: AppliedRules, existingContent: string): Promise<string> {
    return existingContent;
  }

  extractExistingRules(_content: string): string[] {
    return [];
  }

  extractExistingSections(_content: string): RuleSection[] {
    return [];
  }

  generateRulesContent(_sections: RuleSection[]): string {
    return '';
  }
}

class StubAgentManager {
  constructor(private readonly agents: Record<string, StubAgent>) {}

  getAgentById(id: string): StubAgent | undefined {
    return this.agents[id];
  }

  async detectAgents(): Promise<Array<{ agent: StubAgent; configPath: string }>> {
    return Object.values(this.agents).map(agent => ({
      agent,
      configPath: `/detected/${agent.id}`,
    }));
  }
}

describe('PluginManager', () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;

  afterEach(async () => {
    vi.restoreAllMocks();

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createTempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  async function createPluginDir(name: string): Promise<string> {
    const pluginDir = await createTempDir(`agentinit-plugin-${name}-`);
    await writeFile(
      join(pluginDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          exa: {
            command: 'npx',
            args: ['-y', '@exa/mcp-server'],
          },
        },
      }, null, 2),
    );
    return pluginDir;
  }

  async function createClaudeCommandPluginDir(name: string): Promise<string> {
    const pluginDir = await createTempDir(`agentinit-plugin-${name}-`);
    await mkdir(join(pluginDir, '.claude-plugin'), { recursive: true });
    await mkdir(join(pluginDir, 'commands'), { recursive: true });
    await writeFile(
      join(pluginDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: `${name}-plugin`,
        version: '1.0.0',
        commands: 'commands',
      }, null, 2),
    );
    await writeFile(
      join(pluginDir, 'commands', 'hello.md'),
      '---\nname: hello\ndescription: Says hello\n---\nUse the hello workflow.\n',
    );

    return pluginDir;
  }

  async function createClaudeMarketplaceBundleDir(bundleName: string, pluginName: string = 'codex'): Promise<string> {
    const bundleDir = await createTempDir(`agentinit-plugin-bundle-${bundleName}-`);
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
            description: 'Bundled Codex plugin',
            version: '1.0.1',
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

  it('resolves openai marketplace-prefixed plugin names', () => {
    const manager = new PluginManager(new StubAgentManager({}) as never);

    expect(manager.resolveSource('openai/playwright')).toEqual({
      type: 'marketplace',
      marketplace: 'openai',
      pluginName: 'playwright',
    });
  });

  it('MarketplacePluginNotFoundError carries structured properties', () => {
    const error = new MarketplacePluginNotFoundError(
      'nonexistent',
      'openai',
      'OpenAI Skills',
      ['playwright', 'sentry'],
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MarketplacePluginNotFoundError');
    expect(error.pluginName).toBe('nonexistent');
    expect(error.marketplaceId).toBe('openai');
    expect(error.marketplaceName).toBe('OpenAI Skills');
    expect(error.suggestions).toEqual(['playwright', 'sentry']);
    expect(error.message).toContain('Plugin "nonexistent" not found in OpenAI Skills marketplace.');
    expect(error.message).toContain('Did you mean: playwright, sentry?');
  });

  it('MarketplacePluginNotFoundError omits suggestions when empty', () => {
    const error = new MarketplacePluginNotFoundError('foo', 'openai', 'OpenAI Skills', []);

    expect(error.message).toBe('Plugin "foo" not found in OpenAI Skills marketplace.');
    expect(error.suggestions).toEqual([]);
  });

  it('falls back to GitHub for marketplace misses on repo-shaped sources', async () => {
    const projectDir = await createTempDir('agentinit-project-');
    const bundleDir = await createClaudeMarketplaceBundleDir('openai-codex');
    const manager = new PluginManager(new StubAgentManager({}) as never);

    vi.spyOn(manager, 'resolveMarketplacePlugin').mockRejectedValueOnce(
      new MarketplacePluginNotFoundError('codex-plugin-cc', 'openai', 'OpenAI Skills', []),
    );
    const cloneRepoSpy = vi.spyOn(SkillsManager.prototype, 'cloneRepo').mockResolvedValue(bundleDir);

    const result = await manager.installPlugin('openai/codex-plugin-cc', projectDir, {
      list: true,
    });

    expect(cloneRepoSpy).toHaveBeenCalledWith('https://github.com/openai/codex-plugin-cc.git');
    expect(result.plugin.name).toBe('codex');
    expect(result.plugin.skills).toEqual([
      expect.objectContaining({
        name: 'codex-review',
        description: 'Review code with Codex',
      }),
    ]);
    expect(result.plugin.warnings).toEqual(expect.arrayContaining([
      'Plugin "codex-plugin-cc" not found in OpenAI Skills marketplace.',
      'Marketplace lookup failed; trying verified GitHub repository https://github.com/openai/codex-plugin-cc instead.',
      'Source "https://github.com/openai/codex-plugin-cc" is a Claude Code marketplace bundle; using bundled plugin "codex".',
      'Agent definitions (agents/) are Claude Code-specific',
    ]));
  });

  it('keeps other marketplace fallback repositories unverified', async () => {
    const projectDir = await createTempDir('agentinit-project-');
    const pluginDir = await createPluginDir('community-plugin');
    const manager = new PluginManager(new StubAgentManager({}) as never);

    vi.spyOn(manager, 'resolveMarketplacePlugin').mockRejectedValueOnce(
      new MarketplacePluginNotFoundError('community-plugin', 'openai', 'OpenAI Skills', []),
    );
    const cloneRepoSpy = vi.spyOn(SkillsManager.prototype, 'cloneRepo').mockResolvedValue(pluginDir);

    const result = await manager.installPlugin('community-plugin', projectDir, {
      from: 'openai',
      list: true,
    });

    expect(cloneRepoSpy).toHaveBeenCalledWith('https://github.com/openai/community-plugin.git');
    expect(result.plugin.warnings).toEqual(expect.arrayContaining([
      'Plugin "community-plugin" not found in OpenAI Skills marketplace.',
      'Marketplace lookup failed; trying unverified GitHub repository https://github.com/openai/community-plugin instead.',
    ]));
  });

  it('parses direct GitHub Claude marketplace repositories as bundled plugins', async () => {
    const projectDir = await createTempDir('agentinit-project-');
    const bundleDir = await createClaudeMarketplaceBundleDir('openai-codex');
    const manager = new PluginManager(new StubAgentManager({}) as never);

    vi.spyOn(SkillsManager.prototype, 'cloneRepo').mockResolvedValue(bundleDir);

    const result = await manager.installPlugin('https://github.com/openai/codex-plugin-cc', projectDir, {
      list: true,
    });

    expect(result.plugin.name).toBe('codex');
    expect(result.plugin.skills).toEqual([
      expect.objectContaining({
        name: 'codex-review',
      }),
    ]);
    expect(result.plugin.warnings).toEqual(expect.arrayContaining([
      'Source "https://github.com/openai/codex-plugin-cc" is a Claude Code marketplace bundle; using bundled plugin "codex".',
      'Agent definitions (agents/) are Claude Code-specific',
    ]));
  });

  it('inspects Claude-native plugin metadata before install', async () => {
    const homeDir = await createTempDir('agentinit-home-');
    process.env.HOME = homeDir;

    const bundleDir = await createClaudeMarketplaceBundleDir('openai-codex');
    const manager = new PluginManager(new StubAgentManager({}) as never);

    const result = await manager.inspectPlugin(bundleDir);

    expect(result.plugin.name).toBe('codex');
    expect(result.nativePreview).toEqual({
      agent: 'claude',
      pluginKey: 'codex@agentinit-openai-codex',
      installPath: join(homeDir, '.claude', 'plugins', 'cache', 'agentinit-openai-codex', 'codex', '1.0.1'),
      features: ['commands', 'agents'],
    });
  });

  it('reuses the prepared remote plugin context during interactive install', async () => {
    const homeDir = await createTempDir('agentinit-home-');
    process.env.HOME = homeDir;

    const projectDir = await createTempDir('agentinit-project-');
    const bundleDir = await createClaudeMarketplaceBundleDir('openai-codex');
    const claude = new StubAgent('claude');
    const manager = new PluginManager(new StubAgentManager({ claude }) as never);

    const cloneRepoSpy = vi.spyOn(SkillsManager.prototype, 'cloneRepo').mockResolvedValue(bundleDir);

    await manager.preparePluginInstall('https://github.com/openai/codex-plugin-cc');
    await manager.installPlugin('https://github.com/openai/codex-plugin-cc', projectDir, {
      agents: ['claude'],
    });

    expect(cloneRepoSpy).toHaveBeenCalledTimes(1);
  });

  it('installs Claude-native plugin payloads only for Claude Code and tracks them in the registry', async () => {
    const homeDir = await createTempDir('agentinit-home-');
    process.env.HOME = homeDir;
    await mkdir(join(homeDir, '.claude'), { recursive: true });
    await writeFile(
      join(homeDir, '.claude', 'settings.json'),
      JSON.stringify({
        enabledPlugins: {
          'frontend-design@claude-code-plugins': true,
        },
        model: 'opus',
      }, null, 2),
    );

    const projectDir = await createTempDir('agentinit-project-');
    const bundleDir = await createClaudeMarketplaceBundleDir('openai-codex');
    const claude = new StubAgent('claude');
    const beta = new StubAgent('beta');
    const manager = new PluginManager(new StubAgentManager({ claude, beta }) as never);

    const result = await manager.installPlugin(bundleDir, projectDir, {
      agents: ['claude', 'beta'],
    });

    const expectedInstallPath = join(homeDir, '.claude', 'plugins', 'cache', 'agentinit-openai-codex', 'codex', '1.0.1');
    expect(result.nativePlugins.installed).toEqual([
      {
        agent: 'claude',
        pluginKey: 'codex@agentinit-openai-codex',
        installPath: expectedInstallPath,
      },
    ]);
    expect(result.nativePlugins.skipped).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Claude Code-native plugin components detected (commands, agents); they will only work in Claude Code and install into ~/.claude/plugins.',
      'Reload plugins in Claude Code with /reload-plugins to activate native plugin components.',
    ]));

    const installedPlugins = JSON.parse(await readFile(join(homeDir, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    expect(installedPlugins.plugins['codex@agentinit-openai-codex'][0].installPath).toBe(expectedInstallPath);
    expect(await readFile(join(expectedInstallPath, '.claude-plugin', 'plugin.json'), 'utf8')).toContain('"name": "codex"');
    const settings = JSON.parse(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8'));
    expect(settings.enabledPlugins).toEqual({
      'frontend-design@claude-code-plugins': true,
      'codex@agentinit-openai-codex': true,
    });
    expect(settings.model).toBe('opus');

    const registry = await manager.getRegistry(projectDir, false);
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]?.components.nativePlugins).toEqual([
      {
        agent: 'claude',
        pluginKey: 'codex@agentinit-openai-codex',
        installPath: expectedInstallPath,
      },
    ]);
  });

  it('removes Claude-native plugin payloads when removing the plugin', async () => {
    const homeDir = await createTempDir('agentinit-home-');
    process.env.HOME = homeDir;
    await mkdir(join(homeDir, '.claude'), { recursive: true });
    await writeFile(
      join(homeDir, '.claude', 'settings.json'),
      JSON.stringify({
        enabledPlugins: {
          'frontend-design@claude-code-plugins': true,
        },
      }, null, 2),
    );

    const projectDir = await createTempDir('agentinit-project-');
    const bundleDir = await createClaudeMarketplaceBundleDir('openai-codex');
    const claude = new StubAgent('claude');
    const manager = new PluginManager(new StubAgentManager({ claude }) as never);

    await manager.installPlugin(bundleDir, projectDir, {
      agents: ['claude'],
    });

    const result = await manager.removePlugin('codex', projectDir);

    expect(result.removed).toBe(true);
    expect(result.details).toEqual(expect.arrayContaining([
      'Removed native plugin payload: codex@agentinit-openai-codex (claude)',
      'Removed from plugin registry',
    ]));
    await expect(readFile(join(homeDir, '.claude', 'plugins', 'installed_plugins.json'), 'utf8')).resolves.toContain('"plugins": {}');
    const settings = JSON.parse(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8'));
    expect(settings.enabledPlugins).toEqual({
      'frontend-design@claude-code-plugins': true,
    });

    const registry = await manager.getRegistry(projectDir, false);
    expect(registry.plugins).toEqual([]);
  });

  it('resolves marketplace-prefixed plugin names explicitly', () => {
    const manager = new PluginManager(new StubAgentManager({}) as never);

    expect(manager.resolveSource('claude/code-review')).toEqual({
      type: 'marketplace',
      marketplace: 'claude',
      pluginName: 'code-review',
    });
  });

  it('resolves bare plugin names against the default marketplace', () => {
    const manager = new PluginManager(new StubAgentManager({}) as never);

    expect(manager.resolveSource('code-review')).toEqual({
      type: 'marketplace',
      marketplace: 'agentinit',
      pluginName: 'code-review',
    });
  });

  it('supports marketplace override for install sources', () => {
    const manager = new PluginManager(new StubAgentManager({}) as never);

    expect(manager.resolveSource('code-review', { from: 'claude' })).toEqual({
      type: 'marketplace',
      marketplace: 'claude',
      pluginName: 'code-review',
    });
  });

  it('surfaces shared-dir compatible agents alongside detected ones', async () => {
    const projectDir = await createTempDir('agentinit-project-');
    await writeFile(join(projectDir, 'AGENTS.md'), '# shared instructions\n');
    await writeFile(join(projectDir, 'CLAUDE.md'), '# claude instructions\n');

    const manager = new PluginManager();
    const groups = await manager.groupAgentsBySkillsDir(projectDir, false);
    const sharedGroup = groups.find(group => group.dir === '.agents/skills/');

    expect(sharedGroup?.agentNames).toEqual(expect.arrayContaining([
      'GitHub Copilot',
      'Cursor IDE',
      'RooCode',
      'Droid (Factory)',
    ]));
    expect(sharedGroup?.compatibleAgentNames).toEqual(expect.arrayContaining([
      'OpenAI Codex CLI',
      'Google Gemini CLI',
    ]));
  });

  it('installs plugin MCP servers globally when --global is requested', async () => {
    const homeDir = await createTempDir('agentinit-home-');
    process.env.HOME = homeDir;

    const projectDir = await createTempDir('agentinit-project-');
    const pluginDir = await createPluginDir('global');
    const agent = new StubAgent('alpha');
    const manager = new PluginManager(new StubAgentManager({ alpha: agent }) as never);

    await manager.installPlugin(pluginDir, projectDir, {
      global: true,
      agents: ['alpha'],
    });

    expect(agent.appliedGlobalMcp).toEqual(['exa']);
    expect(agent.appliedProjectMcp).toEqual([]);

    const registry = await manager.getRegistry(projectDir, true);
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]?.scope).toBe('global');
  });

  it('does not persist plugins when nothing installable was applied', async () => {
    const projectDir = await createTempDir('agentinit-project-');
    const pluginDir = await createTempDir('agentinit-empty-plugin-');
    const agent = new StubAgent('alpha');
    const manager = new PluginManager(new StubAgentManager({ alpha: agent }) as never);

    const result = await manager.installPlugin(pluginDir, projectDir, {
      agents: ['alpha'],
    });

    expect(result.skills.installed).toEqual([]);
    expect(result.mcpServers.applied).toEqual([]);

    const registry = await manager.getRegistry(projectDir, false);
    expect(registry.plugins).toEqual([]);
  });

  it('removes plugin MCP servers from global config when the plugin is global', async () => {
    const homeDir = await createTempDir('agentinit-home-');
    process.env.HOME = homeDir;

    const projectDir = await createTempDir('agentinit-project-');
    const agent = new StubAgent('alpha');
    const manager = new PluginManager(new StubAgentManager({ alpha: agent }) as never);

    await manager.addToRegistry({
      name: 'example-plugin',
      version: '1.0.0',
      description: '',
      source: { type: 'local', path: '/tmp/example-plugin' },
      format: 'generic',
      installedAt: new Date().toISOString(),
      scope: 'global',
      components: {
        skills: [],
        mcpServers: [{ name: 'exa', agent: 'alpha' }],
      },
      warnings: [],
    }, projectDir, true);

    const result = await manager.removePlugin('example-plugin', projectDir, { global: true });

    expect(result.removed).toBe(true);
    expect(agent.removedGlobalMcp).toEqual(['exa']);
    expect(agent.removedProjectMcp).toEqual([]);

    const registry = await manager.getRegistry(projectDir, true);
    expect(registry.plugins).toHaveLength(0);
  });

  it('removes only the targeted agent components from the plugin registry', async () => {
    const homeDir = await createTempDir('agentinit-home-');
    process.env.HOME = homeDir;

    const projectDir = await createTempDir('agentinit-project-');
    const alpha = new StubAgent('alpha');
    const beta = new StubAgent('beta');
    const manager = new PluginManager(new StubAgentManager({ alpha, beta }) as never);

    await manager.addToRegistry({
      name: 'example-plugin',
      version: '1.0.0',
      description: '',
      source: { type: 'local', path: '/tmp/example-plugin' },
      format: 'generic',
      installedAt: new Date().toISOString(),
      scope: 'project',
      components: {
        skills: [],
        mcpServers: [
          { name: 'exa-alpha', agent: 'alpha' },
          { name: 'exa-beta', agent: 'beta' },
        ],
      },
      warnings: [],
    }, projectDir, false);

    const result = await manager.removePlugin('example-plugin', projectDir, {
      agents: ['alpha'],
    });

    expect(result.removed).toBe(true);
    expect(alpha.removedProjectMcp).toEqual(['exa-alpha']);
    expect(beta.removedProjectMcp).toEqual([]);

    const registry = await manager.getRegistry(projectDir, false);
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]?.components.mcpServers).toEqual([
      { name: 'exa-beta', agent: 'beta' },
    ]);
  });

  it('removes stale plugin entries that have no tracked components', async () => {
    const projectDir = await createTempDir('agentinit-project-');
    const agent = new StubAgent('alpha');
    const manager = new PluginManager(new StubAgentManager({ alpha: agent }) as never);

    await manager.addToRegistry({
      name: 'stale-plugin',
      version: '1.0.0',
      description: '',
      source: { type: 'local', path: '/tmp/stale-plugin' },
      format: 'generic',
      installedAt: new Date().toISOString(),
      scope: 'project',
      components: {
        skills: [],
        mcpServers: [],
      },
      warnings: [],
    }, projectDir, false);

    const result = await manager.removePlugin('stale-plugin', projectDir);

    expect(result.removed).toBe(true);
    expect(result.details).toEqual(['Removed stale plugin registry entry']);

    const registry = await manager.getRegistry(projectDir, false);
    expect(registry.plugins).toEqual([]);
  });

  it('skips targeted skill removal when the skill path is shared with other agents', async () => {
    const homeDir = await createTempDir('agentinit-home-');
    process.env.HOME = homeDir;

    const projectDir = await createTempDir('agentinit-project-');
    const sharedSkillPath = join(projectDir, '.agents/skills/example-skill');
    await mkdir(sharedSkillPath, { recursive: true });

    const alpha = new StubAgent('alpha');
    const beta = new StubAgent('beta');
    const manager = new PluginManager(new StubAgentManager({ alpha, beta }) as never);

    await manager.addToRegistry({
      name: 'example-plugin',
      version: '1.0.0',
      description: '',
      source: { type: 'local', path: '/tmp/example-plugin' },
      format: 'generic',
      installedAt: new Date().toISOString(),
      scope: 'project',
      components: {
        skills: [
          { name: 'example-skill', agent: 'alpha', path: sharedSkillPath, canonicalPath: sharedSkillPath, mode: 'symlink' },
          { name: 'example-skill', agent: 'beta', path: sharedSkillPath, canonicalPath: sharedSkillPath, mode: 'symlink' },
        ],
        mcpServers: [],
      },
      warnings: [],
    }, projectDir, false);

    const result = await manager.removePlugin('example-plugin', projectDir, {
      agents: ['alpha'],
    });

    expect(result.removed).toBe(false);
    expect(result.details).toContain(`Skipped shared canonical skill path: ${sharedSkillPath}`);

    const registry = await manager.getRegistry(projectDir, false);
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]?.components.skills).toHaveLength(2);
  });

  it('installs command-derived skills without leaking temp directories', async () => {
    const projectDir = await createTempDir('agentinit-project-');
    const pluginDir = await createClaudeCommandPluginDir('commands');
    const agent = new StubAgent('alpha');
    const manager = new PluginManager(new StubAgentManager({ alpha: agent }) as never);
    const tempBefore = new Set(
      (await readdir(tmpdir())).filter(name => name.startsWith('agentinit-plugin-cmd-'))
    );

    const result = await manager.installPlugin(pluginDir, projectDir, {
      agents: ['alpha'],
    });

    expect(result.skills.installed).toHaveLength(1);
    const installedPath = result.skills.installed[0]?.path;
    expect(installedPath).toBe(join(projectDir, '.agents/skills', 'hello'));
    const installedContent = await readFile(join(installedPath!, 'SKILL.md'), 'utf8');
    expect(installedContent).toContain('name: hello');
    expect(installedContent).toContain('Use the hello workflow.');

    const tempAfter = (await readdir(tmpdir())).filter(
      name => name.startsWith('agentinit-plugin-cmd-') && !tempBefore.has(name)
    );
    expect(tempAfter).toEqual([]);
  });
});
