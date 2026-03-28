import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPluginsCommand } from '../../src/commands/plugins.js';
import { PluginManager } from '../../src/core/pluginManager.js';
import { logger } from '../../src/utils/logger.js';

describe('plugins command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an explicit marketplace for plugins search', async () => {
    const titleSpy = vi.spyOn(logger, 'title').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const program = new Command();
    registerPluginsCommand(program);

    await program.parseAsync(['plugins', 'search'], { from: 'user' });

    expect(titleSpy).toHaveBeenCalledWith('🔌 AgentInit - Plugin Search');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Please specify a marketplace with --from <marketplace>.'));
    expect(infoSpy).toHaveBeenCalledWith('  agentinit plugins search --from claude');
  });

  it('searches the requested marketplace explicitly', async () => {
    const titleSpy = vi.spyOn(logger, 'title').mockImplementation(() => {});
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

    expect(titleSpy).toHaveBeenCalledWith('🔌 AgentInit - Plugin Search');
    expect(PluginManager.prototype.listMarketplacePlugins).toHaveBeenCalledWith('claude', 'code', undefined);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 plugin(s):'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('agentinit plugins install claude/<name>'));
  });
});
