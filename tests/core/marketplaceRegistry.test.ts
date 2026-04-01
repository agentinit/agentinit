import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getMarketplaceCategories,
  getConfiguredDefaultMarketplaceId,
  getMarketplace,
  getMarketplaceIds,
} from '../../src/core/marketplaceRegistry.js';
import { writeUserConfig } from '../../src/core/userConfig.js';

describe('marketplaceRegistry', () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-marketplace-home-'));
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

  it('merges custom marketplaces with the built-in registry using the standard layout', async () => {
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

    expect(getMarketplaceIds()).toEqual(expect.arrayContaining(['agentinit', 'claude', 'openai', 'acme']));
    expect(getMarketplace('acme')).toEqual({
      id: 'acme',
      name: 'Acme Marketplace',
      repoUrl: 'https://github.com/acme/marketplace.git',
      pluginDirs: ['skills', 'mcps', 'rules'],
      cacheTtlMs: 3600000,
    });
    expect(getConfiguredDefaultMarketplaceId()).toBe('acme');
  });

  it('derives the supported marketplace categories from built-in and custom registries', async () => {
    await writeUserConfig({
      customMarketplaces: [
        {
          identifier: 'acme',
          name: 'Acme Marketplace',
          repoUrl: 'https://github.com/acme/marketplace.git',
        },
      ],
      verifiedGithubRepos: [],
    });

    expect(getMarketplaceCategories()).toEqual(expect.arrayContaining([
      'official',
      'community',
      'curated',
      'system',
      'experimental',
      'skills',
      'mcps',
      'rules',
    ]));
    expect(getMarketplaceCategories('acme')).toEqual(['skills', 'mcps', 'rules']);
  });

  it('ignores configured defaults that do not resolve to a known marketplace', async () => {
    await writeUserConfig({
      defaultMarketplace: 'missing',
      customMarketplaces: [],
      verifiedGithubRepos: [],
    });

    expect(getConfiguredDefaultMarketplaceId()).toBeUndefined();
  });
});
