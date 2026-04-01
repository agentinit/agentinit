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

  beforeEach(async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-config-home-'));
    tempDirs.push(homeDir);
    process.env.HOME = homeDir;
  });

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
});
