import { Command } from 'commander';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prompts from 'prompts';
import { registerPluginsCommand } from '../../src/commands/plugins.js';
import { PluginManager } from '../../src/core/pluginManager.js';
import { writeUserConfig } from '../../src/core/userConfig.js';
import { logger } from '../../src/utils/logger.js';

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

describe('plugins command', () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-plugins-home-'));
    tempDirs.push(homeDir);
    process.env.HOME = homeDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(prompts).mockReset();
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('requires an explicit marketplace for plugins search', async () => {
    const titleBoxSpy = vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'search'], { from: 'user' });

    expect(titleBoxSpy).toHaveBeenCalledWith('AgentInit  Plugin Search');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Please specify a marketplace with --from <marketplace>.'));
    expect(infoSpy).toHaveBeenCalledWith('  agentinit plugins search --from claude');
  });

  it('uses the configured default marketplace for plugins search', async () => {
    const titleBoxSpy = vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    await writeUserConfig({
      defaultMarketplace: 'claude',
      customMarketplaces: [],
      verifiedGithubRepos: [],
    });

    vi.spyOn(PluginManager.prototype, 'listMarketplacePlugins').mockResolvedValue([
      {
        name: 'code-review',
        description: 'Review plugin',
        version: '1.0.0',
        path: 'plugins/code-review',
        category: 'official',
        registry: 'claude',
      },
    ]);

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'search', 'code'], { from: 'user' });

    expect(titleBoxSpy).toHaveBeenCalledWith('AgentInit  Plugin Search');
    expect(PluginManager.prototype.listMarketplacePlugins).toHaveBeenCalledWith('claude', 'code', undefined);
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('Please specify a marketplace with --from <marketplace>.'));
  });

  it('searches the requested marketplace explicitly', async () => {
    const titleBoxSpy = vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(PluginManager.prototype, 'listMarketplacePlugins').mockResolvedValue([
      {
        name: 'code-review',
        description: 'Review plugin',
        version: '1.0.0',
        path: 'plugins/code-review',
        category: 'official',
        registry: 'claude',
      },
    ]);

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'search', 'code', '--from', 'claude'], { from: 'user' });

    expect(titleBoxSpy).toHaveBeenCalledWith('AgentInit  Plugin Search');
    expect(PluginManager.prototype.listMarketplacePlugins).toHaveBeenCalledWith('claude', 'code', undefined);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 plugin(s):'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('agentinit plugins install claude/<name>'));
  });

  it('shows Claude-native warnings before prompting and prints install paths', async () => {
    process.env.HOME = '/Users/tester';

    const titleBoxSpy = vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    const sectionSpy = vi.spyOn(logger, 'section').mockImplementation(() => {});
    const treeSpy = vi.spyOn(logger, 'tree').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    vi.spyOn(PluginManager.prototype, 'preparePluginInstall').mockResolvedValue({
      plugin: {
        name: 'codex',
        version: '1.0.1',
        description: 'Bundled Codex plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/openai/codex-plugin-cc.git' },
        skills: [
          { name: 'codex-review', description: 'Review code with Codex', path: '/tmp/review.md' },
        ],
        mcpServers: [],
        warnings: [
          'Plugin "codex-plugin-cc" not found in OpenAI Skills marketplace.',
          'Marketplace lookup failed; trying verified GitHub repository https://github.com/openai/codex-plugin-cc instead.',
          'Source "https://github.com/openai/codex-plugin-cc" is a Claude Code marketplace bundle; using bundled plugin "codex".',
          'Hooks (hooks/) are Claude Code-specific',
          'Agent definitions (agents/) are Claude Code-specific',
        ],
      },
      nativePreview: {
        agent: 'claude',
        pluginKey: 'codex@openai-codex',
        installPath: '/Users/tester/.claude/plugins/cache/openai-codex/codex/1.0.1',
        features: ['commands', 'hooks', 'agents'],
      },
    });

    vi.spyOn(PluginManager.prototype, 'groupAgentsBySkillsDir').mockResolvedValue([
      {
        dir: '.claude/skills/',
        agents: [{ id: 'claude' } as any],
        agentNames: ['Claude Code'],
        compatibleAgents: [],
        compatibleAgentNames: [],
      },
      {
        dir: '.agents/skills/',
        agents: [{ id: 'cursor' } as any, { id: 'copilot' } as any],
        agentNames: ['Cursor IDE', 'GitHub Copilot'],
        compatibleAgents: [],
        compatibleAgentNames: [],
      },
    ]);

    vi.mocked(prompts).mockResolvedValue({
      groups: [['claude']],
    } as never);

    const installPluginSpy = vi.spyOn(PluginManager.prototype, 'installPlugin').mockResolvedValue({
      plugin: {
        name: 'codex',
        version: '1.0.1',
        description: 'Bundled Codex plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/openai/codex-plugin-cc.git' },
        skills: [
          { name: 'codex-review', description: 'Review code with Codex', path: '/tmp/review.md' },
        ],
        mcpServers: [],
        warnings: [
          'Plugin "codex-plugin-cc" not found in OpenAI Skills marketplace.',
          'Marketplace lookup failed; trying verified GitHub repository https://github.com/openai/codex-plugin-cc instead.',
          'Source "https://github.com/openai/codex-plugin-cc" is a Claude Code marketplace bundle; using bundled plugin "codex".',
        ],
      },
      skills: {
        installed: [],
        skipped: [],
      },
      mcpServers: { applied: [], skipped: [] },
      nativePlugins: {
        installed: [
          {
            agent: 'claude',
            pluginKey: 'codex@openai-codex',
            installPath: '/Users/tester/.claude/plugins/cache/openai-codex/codex/1.0.1',
          },
        ],
        skipped: [],
      },
      warnings: [
        'Plugin "codex-plugin-cc" not found in OpenAI Skills marketplace.',
        'Marketplace lookup failed; trying verified GitHub repository https://github.com/openai/codex-plugin-cc instead.',
        'Source "https://github.com/openai/codex-plugin-cc" is a Claude Code marketplace bundle; using bundled plugin "codex".',
        'Claude Code-native plugin components detected (commands, hooks, agents); they will only work in Claude Code and install into ~/.claude/plugins.',
        'Reload plugins in Claude Code with /reload-plugins to activate native plugin components.',
      ],
    });

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'install', 'openai/codex-plugin-cc'], { from: 'user' });

    expect(titleBoxSpy).toHaveBeenCalledWith('AgentInit  Plugins');
    expect(sectionSpy).toHaveBeenCalledWith('Source');
    expect(sectionSpy).toHaveBeenCalledWith('Compatibility');
    expect(vi.mocked(prompts)).toHaveBeenCalledOnce();
    expect(vi.mocked(prompts).mock.calls[0]?.[0]).toMatchObject({
      message: 'Select which agents should receive this plugin:',
      choices: [
        expect.objectContaining({
          selected: true,
          description: expect.stringContaining('Full plugin support is available in Claude Code; the native plugin installs at ~/.claude/plugins/cache/openai-codex/codex/1.0.1.'),
        }),
        expect.objectContaining({
          selected: true,
          description: expect.stringContaining('Skills will be installed here, but Claude-specific components will not be fully available for these agents.'),
        }),
      ],
    });
    // Claude-related warnings now go through logger.tree() with orange coloring
    expect(treeSpy).toHaveBeenCalledWith(expect.stringContaining('Claude Code'), expect.any(Boolean));
    expect(treeSpy).toHaveBeenCalledWith(expect.stringContaining('native install path'), expect.any(Boolean));
    expect(installPluginSpy).toHaveBeenCalledWith(
      'openai/codex-plugin-cc',
      process.cwd(),
      expect.objectContaining({ agents: ['claude'] }),
    );
    // Installed components now rendered via logger.tree() and logger.section()
    expect(sectionSpy).toHaveBeenCalledWith('Native Install');
  });

  it('keeps non-allowlisted GitHub fallback repos explicitly unverified', async () => {
    const treeSpy = vi.spyOn(logger, 'tree').mockImplementation(() => {});
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});

    vi.spyOn(PluginManager.prototype, 'inspectPlugin').mockResolvedValue({
      plugin: {
        name: 'community-plugin',
        version: '0.2.0',
        description: 'Community plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/acme/community-plugin.git' },
        skills: [],
        mcpServers: [],
        warnings: [
          'Plugin "community-plugin" not found in Claude Code marketplace.',
          'Marketplace lookup failed; trying unverified GitHub repository https://github.com/acme/community-plugin instead.',
        ],
      },
      nativePreview: null,
    });

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'install', 'acme/community-plugin', '--list'], { from: 'user' });

    expect(treeSpy).toHaveBeenCalledWith(expect.stringContaining('Unverified GitHub repository: https://github.com/acme/community-plugin'), expect.any(Boolean));
    expect(treeSpy).not.toHaveBeenCalledWith(expect.stringContaining('Verified GitHub repository: https://github.com/acme/community-plugin'), expect.any(Boolean));
  });

  it('warns explicitly when Claude-native install is skipped after deselecting Claude', async () => {
    process.env.HOME = '/Users/tester';

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    vi.spyOn(logger, 'section').mockImplementation(() => {});
    vi.spyOn(logger, 'tree').mockImplementation(() => {});

    vi.spyOn(PluginManager.prototype, 'preparePluginInstall').mockResolvedValue({
      plugin: {
        name: 'codex',
        version: '1.0.1',
        description: 'Bundled Codex plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/openai/codex-plugin-cc.git' },
        skills: [
          { name: 'codex-review', description: 'Review code with Codex', path: '/tmp/review.md' },
        ],
        mcpServers: [],
        warnings: [],
      },
      nativePreview: {
        agent: 'claude',
        pluginKey: 'codex@openai-codex',
        installPath: '/Users/tester/.claude/plugins/cache/openai-codex/codex/1.0.1',
        features: ['commands', 'hooks', 'agents'],
      },
    });

    vi.spyOn(PluginManager.prototype, 'groupAgentsBySkillsDir').mockResolvedValue([
      {
        dir: '.claude/skills/',
        agents: [{ id: 'claude' } as any],
        agentNames: ['Claude Code'],
        compatibleAgents: [],
        compatibleAgentNames: [],
      },
      {
        dir: '.agents/skills/',
        agents: [{ id: 'cursor' } as any],
        agentNames: ['Cursor IDE'],
        compatibleAgents: [],
        compatibleAgentNames: [],
      },
    ]);

    vi.mocked(prompts).mockResolvedValue({
      groups: [['cursor']],
    } as never);

    vi.spyOn(PluginManager.prototype, 'installPlugin').mockResolvedValue({
      plugin: {
        name: 'codex',
        version: '1.0.1',
        description: 'Bundled Codex plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/openai/codex-plugin-cc.git' },
        skills: [
          { name: 'codex-review', description: 'Review code with Codex', path: '/tmp/review.md' },
        ],
        mcpServers: [],
        warnings: [],
      },
      skills: {
        installed: [
          {
            name: 'codex-review',
            agent: 'cursor',
            path: `${process.cwd()}/.agents/skills/codex-review`,
            canonicalPath: `${process.cwd()}/.agents/skills/codex-review`,
            mode: 'symlink',
          },
        ],
        skipped: [],
      },
      mcpServers: { applied: [], skipped: [] },
      nativePlugins: {
        installed: [],
        skipped: [
          {
            agent: 'claude',
            reason: 'Claude Code was not selected; skipped native plugin components (commands, hooks, agents).',
          },
        ],
      },
      warnings: [
        'Claude Code-native plugin components detected (commands, hooks, agents), but no Claude Code target was selected; skipped native install.',
      ],
    });

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'install', 'openai/codex-plugin-cc'], { from: 'user' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipped native plugin payload for claude: Claude Code was not selected; skipped native plugin components'),
    );
  });

  it('prompts to install globally when no project agent skills directories are detected', async () => {
    process.env.HOME = '/Users/tester';

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    vi.spyOn(logger, 'section').mockImplementation(() => {});
    vi.spyOn(logger, 'tree').mockImplementation(() => {});

    vi.spyOn(PluginManager.prototype, 'preparePluginInstall').mockResolvedValue({
      plugin: {
        name: 'codex',
        version: '1.0.1',
        description: 'Bundled Codex plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/openai/codex-plugin-cc.git' },
        skills: [
          { name: 'codex-review', description: 'Review code with Codex', path: '/tmp/review.md' },
        ],
        mcpServers: [],
        warnings: [],
      },
      nativePreview: {
        agent: 'claude',
        pluginKey: 'codex@openai-codex',
        installPath: '/Users/tester/.claude/plugins/cache/openai-codex/codex/1.0.1',
        features: ['commands', 'hooks', 'agents'],
      },
    });

    vi.spyOn(PluginManager.prototype, 'groupAgentsBySkillsDir').mockResolvedValue([]);

    vi.mocked(prompts)
      .mockResolvedValueOnce({ scope: 'global' } as never)
      .mockResolvedValueOnce({ groups: [['claude']] } as never);

    const installPluginSpy = vi.spyOn(PluginManager.prototype, 'installPlugin').mockResolvedValue({
      plugin: {
        name: 'codex',
        version: '1.0.1',
        description: 'Bundled Codex plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/openai/codex-plugin-cc.git' },
        skills: [
          { name: 'codex-review', description: 'Review code with Codex', path: '/tmp/review.md' },
        ],
        mcpServers: [],
        warnings: [],
      },
      skills: {
        installed: [
          {
            name: 'codex-review',
            agent: 'claude',
            path: '/Users/tester/.claude/skills/codex-review',
            canonicalPath: '/Users/tester/.agents/skills/codex-review',
            mode: 'symlink',
          },
        ],
        skipped: [],
      },
      mcpServers: { applied: [], skipped: [] },
      nativePlugins: {
        installed: [],
        skipped: [],
      },
      warnings: [],
    });

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'install', 'openai/codex-plugin-cc'], { from: 'user' });

    expect(warnSpy).toHaveBeenCalledWith('No agents with skills support detected in this project.');
    expect(vi.mocked(prompts)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prompts).mock.calls[0]?.[0]).toMatchObject({
      message: 'Install this plugin globally instead?',
    });
    const globalPrompt = vi.mocked(prompts).mock.calls[1]?.[0] as unknown as {
      message: string;
      choices: Array<Record<string, unknown>>;
    };
    expect(globalPrompt).toMatchObject({
      message: 'Select which global agents should receive this plugin:',
    });
    expect(globalPrompt.choices[0]).toMatchObject({
      title: expect.stringContaining('~/.agents/skills'),
      selected: true,
      description: expect.stringContaining('Skills will be installed here, but Claude-specific components will not be fully available for these agents.'),
    });
    expect(globalPrompt.choices[1]).toMatchObject({
      title: expect.stringContaining('~/.claude/skills'),
      selected: true,
      description: expect.stringContaining('Claude Desktop shares this skills directory but only receives the installed skills.'),
    });
    expect(globalPrompt).toMatchObject({
      choices: expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining('~/.copilot/skills'),
          selected: false,
          description: expect.stringContaining('Skills will be installed here, but Claude-specific components will not be fully available for these agents.'),
        }),
        expect.objectContaining({
          title: expect.stringContaining('~/.openclaw/skills'),
          selected: false,
          description: expect.stringContaining('Skills will be installed here, but Claude-specific components will not be fully available for these agents.'),
        }),
        expect.objectContaining({
          title: expect.stringContaining('~/.hermes/skills'),
          selected: false,
          description: expect.stringContaining('Skills will be installed here, but Claude-specific components will not be fully available for these agents.'),
        }),
      ]),
    });
    expect(installPluginSpy).toHaveBeenCalledWith(
      'openai/codex-plugin-cc',
      process.cwd(),
      expect.objectContaining({ agents: ['claude'], global: true }),
    );
  });

  it('maps the canonical global .agents choice to AGENTS-compatible agent ids', async () => {
    process.env.HOME = '/Users/tester';

    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    vi.spyOn(logger, 'section').mockImplementation(() => {});
    vi.spyOn(logger, 'tree').mockImplementation(() => {});

    vi.spyOn(PluginManager.prototype, 'preparePluginInstall').mockResolvedValue({
      plugin: {
        name: 'codex',
        version: '1.0.1',
        description: 'Bundled Codex plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/openai/codex-plugin-cc.git' },
        skills: [
          { name: 'codex-review', description: 'Review code with Codex', path: '/tmp/review.md' },
        ],
        mcpServers: [],
        warnings: [],
      },
      nativePreview: {
        agent: 'claude',
        pluginKey: 'codex@openai-codex',
        installPath: '/Users/tester/.claude/plugins/cache/openai-codex/codex/1.0.1',
        features: ['commands', 'hooks', 'agents'],
      },
    });

    vi.spyOn(PluginManager.prototype, 'groupAgentsBySkillsDir').mockResolvedValue([]);

    vi.mocked(prompts).mockImplementation(async (config: any) => {
      if (config.name === 'scope') {
        return { scope: 'global' } as never;
      }

      if (config.name === 'groups') {
        return { groups: [config.choices[0].value] } as never;
      }

      return {} as never;
    });

    const installPluginSpy = vi.spyOn(PluginManager.prototype, 'installPlugin').mockResolvedValue({
      plugin: {
        name: 'codex',
        version: '1.0.1',
        description: 'Bundled Codex plugin',
        format: 'claude',
        source: { type: 'github', url: 'https://github.com/openai/codex-plugin-cc.git' },
        skills: [],
        mcpServers: [],
        warnings: [],
      },
      skills: { installed: [], skipped: [] },
      mcpServers: { applied: [], skipped: [] },
      nativePlugins: { installed: [], skipped: [] },
      warnings: [],
    });

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'install', 'openai/codex-plugin-cc'], { from: 'user' });

    expect(installPluginSpy).toHaveBeenCalledWith(
      'openai/codex-plugin-cc',
      process.cwd(),
      expect.objectContaining({
        global: true,
        agents: expect.arrayContaining(['copilot', 'codex', 'gemini', 'cursor', 'roo', 'droid', 'openclaw', 'hermes']),
      }),
    );
    const selectedAgents = (installPluginSpy.mock.calls[0]?.[2] as { agents?: string[] })?.agents || [];
    expect(selectedAgents).not.toContain('claude');
  });
});
