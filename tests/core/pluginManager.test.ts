import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Agent } from '../../src/agents/Agent.js';
import { PluginManager } from '../../src/core/pluginManager.js';
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

  it('resolves marketplace-prefixed plugin names explicitly', () => {
    const manager = new PluginManager(new StubAgentManager({}) as never);

    expect(manager.resolveSource('claude/code-review')).toEqual({
      type: 'marketplace',
      marketplace: 'claude',
      pluginName: 'code-review',
    });
  });

  it('rejects bare plugin names without an explicit marketplace', () => {
    const manager = new PluginManager(new StubAgentManager({}) as never);

    expect(() => manager.resolveSource('code-review')).toThrow(
      'Ambiguous plugin source "code-review"',
    );
  });

  it('supports marketplace override for install sources', () => {
    const manager = new PluginManager(new StubAgentManager({}) as never);

    expect(manager.resolveSource('code-review', { from: 'claude' })).toEqual({
      type: 'marketplace',
      marketplace: 'claude',
      pluginName: 'code-review',
    });
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
