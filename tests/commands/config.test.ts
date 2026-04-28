import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerConfigCommand } from '../../src/commands/config.js';
import { readUserConfig, writeUserConfig } from '../../src/core/userConfig.js';
import { logger } from '../../src/utils/logger.js';

describe('config command', () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;
  const originalExitCode = process.exitCode;
  const originalAgentSettingsScope = process.env.AGENTINIT_AGENT_DEFAULT_SCOPE;

  beforeEach(async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-config-home-'));
    tempDirs.push(homeDir);
    process.env.HOME = homeDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalAgentSettingsScope === undefined) {
      delete process.env.AGENTINIT_AGENT_DEFAULT_SCOPE;
    } else {
      process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = originalAgentSettingsScope;
    }

    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function runConfig(args: string[]): Promise<void> {
    const program = new Command();
    registerConfigCommand(program);
    await program.parseAsync(args, { from: 'user' });
  }

  function silenceLogger() {
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    vi.spyOn(logger, 'section').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'success').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  }

  it('adds a custom marketplace and can mark it as the default', async () => {
    silenceLogger();

    await runConfig([
      'config',
      'marketplaces',
      'add',
      'acme',
      'https://github.com/acme/marketplace.git',
      '--name',
      'Acme Marketplace',
      '--default',
    ]);

    await expect(readUserConfig()).resolves.toEqual({
      defaultMarketplace: 'acme',
      customMarketplaces: [
        {
          identifier: 'acme',
          name: 'Acme Marketplace',
          repoUrl: 'https://github.com/acme/marketplace.git',
        },
      ],
      verifiedGithubRepos: [],
    });
  });

  it('sets and clears a built-in default marketplace', async () => {
    silenceLogger();

    await runConfig(['config', 'marketplaces', 'default', 'claude']);
    expect((await readUserConfig()).defaultMarketplace).toBe('claude');

    await runConfig(['config', 'marketplaces', 'clear-default']);
    expect((await readUserConfig()).defaultMarketplace).toBeUndefined();
  });

  it('lists built-in and custom marketplaces with default markers', async () => {
    silenceLogger();
    const treeSpy = vi.spyOn(logger, 'tree').mockImplementation(() => {});

    await writeUserConfig({
      defaultMarketplace: 'acme',
      customMarketplaces: [
        {
          identifier: 'acme',
          name: 'Acme Marketplace',
          repoUrl: 'https://github.com/acme/marketplace.git',
        },
      ],
      verifiedGithubRepos: [],
    });

    await runConfig(['config', 'marketplaces', 'list']);

    expect(treeSpy).toHaveBeenCalledWith(expect.stringContaining('[built-in]'), expect.any(Boolean));
    expect(treeSpy).toHaveBeenCalledWith(expect.stringContaining('acme'), expect.any(Boolean));
    expect(treeSpy).toHaveBeenCalledWith(expect.stringContaining('[custom, default]'), expect.any(Boolean));
  });

  it('adds, lists, and removes exact verified GitHub repos', async () => {
    silenceLogger();
    const treeSpy = vi.spyOn(logger, 'tree').mockImplementation(() => {});

    await runConfig(['config', 'verified-repos', 'add', 'Acme/Private-Plugin']);
    expect((await readUserConfig()).verifiedGithubRepos).toEqual(['acme/private-plugin']);

    await runConfig(['config', 'verified-repos', 'list']);
    expect(treeSpy).toHaveBeenCalledWith(expect.stringContaining('openai/codex-plugin-cc'), expect.any(Boolean));
    expect(treeSpy).toHaveBeenCalledWith(expect.stringContaining('acme/private-plugin'), expect.any(Boolean));

    await runConfig(['config', 'verified-repos', 'remove', 'acme/private-plugin']);
    expect((await readUserConfig()).verifiedGithubRepos).toEqual([]);
  });

  it('sets, shows, and clears the default agent settings scope', async () => {
    silenceLogger();
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    await runConfig(['config', 'agent-settings', 'scope', 'project']);
    expect((await readUserConfig()).defaultAgentSettingsScope).toBe('project');

    process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = 'local';
    await runConfig(['config', 'agent-settings', 'scope']);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Effective default agent settings scope:'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Configured in user config:'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Environment override:'));

    await runConfig(['config', 'agent-settings', 'clear-scope']);
    expect((await readUserConfig()).defaultAgentSettingsScope).toBeUndefined();
  });

  it('reports invalid environment default agent settings scope overrides as ignored', async () => {
    silenceLogger();
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    await runConfig(['config', 'agent-settings', 'scope', 'project']);
    process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = 'workspace';
    await runConfig(['config', 'agent-settings', 'scope']);

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Effective default agent settings scope:'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid environment override ignored:'));
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('Environment override:'));
  });

  it('sets a non-zero exit code for invalid marketplace operations', async () => {
    silenceLogger();

    await runConfig(['config', 'marketplaces', 'add', 'Invalid Name', 'https://github.com/acme/marketplace.git']);
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;

    await runConfig(['config', 'marketplaces', 'remove', 'claude']);
    expect(process.exitCode).toBe(1);
  });

  it('sets a non-zero exit code for invalid verified repo operations', async () => {
    silenceLogger();

    await runConfig(['config', 'verified-repos', 'remove', 'openai/codex-plugin-cc']);

    expect(process.exitCode).toBe(1);
  });

  it('sets a non-zero exit code for invalid agent settings scope operations', async () => {
    silenceLogger();

    await runConfig(['config', 'agent-settings', 'scope', 'workspace']);

    expect(process.exitCode).toBe(1);
  });
});
