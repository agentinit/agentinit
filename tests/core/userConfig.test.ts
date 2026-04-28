import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultUserConfig,
  getEffectiveAgentSettingsDefaultScopeSync,
  getUserConfigPath,
  isVerifiedGitHubRepoSync,
  readUserConfig,
  readUserConfigSync,
  writeUserConfig,
} from '../../src/core/userConfig.js';

describe('userConfig', () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;
  const originalAgentSettingsScope = process.env.AGENTINIT_AGENT_DEFAULT_SCOPE;

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

    if (originalAgentSettingsScope === undefined) {
      delete process.env.AGENTINIT_AGENT_DEFAULT_SCOPE;
    } else {
      process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = originalAgentSettingsScope;
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
    await mkdir(join(process.env.HOME!, '.agentinit'), { recursive: true });
    await writeFile(getUserConfigPath(), `${JSON.stringify({
      defaultMarketplace: ' ClaUDe ',
      defaultAgentSettingsScope: ' Project ',
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
    }, null, 2)}\n`);

    await expect(readUserConfig()).resolves.toEqual({
      defaultMarketplace: 'claude',
      defaultAgentSettingsScope: 'project',
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

  it('defaults omitted agent settings scope to global and lets env override user config', async () => {
    await writeUserConfig({
      defaultAgentSettingsScope: 'project',
      customMarketplaces: [],
      verifiedGithubRepos: [],
    });

    expect(getEffectiveAgentSettingsDefaultScopeSync()).toBe('project');

    process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = 'local';
    expect(getEffectiveAgentSettingsDefaultScopeSync()).toBe('local');

    process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = 'invalid';
    expect(getEffectiveAgentSettingsDefaultScopeSync()).toBe('project');

    delete process.env.AGENTINIT_AGENT_DEFAULT_SCOPE;
    await writeUserConfig({
      customMarketplaces: [],
      verifiedGithubRepos: [],
    });
    expect(getEffectiveAgentSettingsDefaultScopeSync()).toBe('global');
  });
});
