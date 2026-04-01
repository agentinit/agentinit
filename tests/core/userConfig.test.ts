import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultUserConfig,
  getUserConfigPath,
  isVerifiedGitHubRepoSync,
  readUserConfig,
  readUserConfigSync,
  writeUserConfig,
} from '../../src/core/userConfig.js';

describe('userConfig', () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-user-config-home-'));
    tempDirs.push(homeDir);
    process.env.HOME = homeDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('returns the default config when the user config file is missing', async () => {
    expect(getUserConfigPath()).toBe(join(process.env.HOME!, '.agentinit', 'config.json'));
    expect(readUserConfigSync()).toEqual(createDefaultUserConfig());
    await expect(readUserConfig()).resolves.toEqual(createDefaultUserConfig());
  });

  it('normalizes and deduplicates persisted config entries', async () => {
    await writeUserConfig({
      defaultMarketplace: ' ClaUDe ',
      customMarketplaces: [
        {
          identifier: 'Acme',
          name: '  Acme Marketplace  ',
          repoUrl: 'https://github.com/acme/marketplace.git/',
        },
        {
          identifier: 'acme',
          name: 'Duplicate',
          repoUrl: 'https://github.com/acme/duplicate.git',
        },
      ],
      verifiedGithubRepos: ['Acme/Private-Plugin', 'acme/private-plugin'],
    });

    await expect(readUserConfig()).resolves.toEqual({
      defaultMarketplace: 'claude',
      customMarketplaces: [
        {
          identifier: 'acme',
          name: 'Acme Marketplace',
          repoUrl: 'https://github.com/acme/marketplace.git',
        },
      ],
      verifiedGithubRepos: ['acme/private-plugin'],
    });
  });

  it('treats built-in and user-configured exact GitHub repos as verified', async () => {
    await writeUserConfig({
      customMarketplaces: [],
      verifiedGithubRepos: ['Acme/Private-Plugin'],
    });

    expect(isVerifiedGitHubRepoSync('openai', 'codex-plugin-cc')).toBe(true);
    expect(isVerifiedGitHubRepoSync('acme', 'private-plugin')).toBe(true);
    expect(isVerifiedGitHubRepoSync('acme', 'other-plugin')).toBe(false);
  });
});
