import { Command } from 'commander';
import { cyan, dim, green } from '../utils/colors.js';
import { logger } from '../utils/logger.js';
import { MARKETPLACES, getConfiguredDefaultMarketplaceId, getMarketplace, getMarketplaceIds } from '../core/marketplaceRegistry.js';
import {
  getBuiltInVerifiedGithubRepos,
  normalizeGitHubRepoRef,
  normalizeMarketplaceIdentifier,
  normalizeMarketplaceName,
  normalizeMarketplaceRepoUrl,
  readUserConfig,
  writeUserConfig,
} from '../core/userConfig.js';

const BUILT_IN_MARKETPLACE_IDS = new Set(MARKETPLACES.map(marketplace => marketplace.id));
const BUILT_IN_VERIFIED_REPOS = new Set(getBuiltInVerifiedGithubRepos());

function sortConfig(config: Awaited<ReturnType<typeof readUserConfig>>) {
  config.customMarketplaces.sort((left, right) => left.identifier.localeCompare(right.identifier));
  config.verifiedGithubRepos.sort((left, right) => left.localeCompare(right));
  return config;
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage AgentInit user configuration');

  const marketplaces = config
    .command('marketplaces')
    .description('Manage configured marketplaces');

  marketplaces
    .command('list')
    .description('List built-in and custom marketplaces')
    .action(async () => {
      logger.titleBox('AgentInit  Configuration');
      logger.section('Marketplaces');

      const defaultMarketplace = getConfiguredDefaultMarketplaceId();
      const marketplaceIds = getMarketplaceIds();

      for (let i = 0; i < marketplaceIds.length; i++) {
        const identifier = marketplaceIds[i]!;
        const marketplace = getMarketplace(identifier);
        if (!marketplace) {
          continue;
        }

        const flags = [
          BUILT_IN_MARKETPLACE_IDS.has(identifier) ? 'built-in' : 'custom',
          defaultMarketplace === identifier ? 'default' : null,
        ].filter(Boolean).join(', ');

        logger.tree(
          `${cyan(identifier)} ${dim(`[${flags}]`)} ${marketplace.name} ${dim(`-> ${marketplace.repoUrl}`)}`,
          i === marketplaceIds.length - 1,
        );
      }

      if (!defaultMarketplace) {
        logger.info('No default marketplace configured.');
      }
    });

  marketplaces
    .command('add <identifier> <repoUrl>')
    .description('Add a custom marketplace')
    .option('--name <displayName>', 'Display name for this marketplace')
    .option('--default', 'Set this marketplace as the default')
    .action(async (identifierArg: string, repoUrlArg: string, options) => {
      logger.titleBox('AgentInit  Configuration');

      try {
        const identifier = normalizeMarketplaceIdentifier(identifierArg);
        const repoUrl = normalizeMarketplaceRepoUrl(repoUrlArg);
        const configState = await readUserConfig();

        if (BUILT_IN_MARKETPLACE_IDS.has(identifier)) {
          throw new Error(`Marketplace "${identifier}" is built in and cannot be redefined.`);
        }
        if (configState.customMarketplaces.some(marketplace => marketplace.identifier === identifier)) {
          throw new Error(`Marketplace "${identifier}" already exists.`);
        }

        configState.customMarketplaces.push({
          identifier,
          name: normalizeMarketplaceName(options.name, identifier),
          repoUrl,
        });
        if (options.default) {
          configState.defaultMarketplace = identifier;
        }

        await writeUserConfig(sortConfig(configState));

        logger.success(`Added marketplace ${green(identifier)}.`);
        logger.info(`  ${repoUrl}`);
        if (options.default) {
          logger.info('  Set as the configured default marketplace.');
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Failed to add marketplace.');
      }
    });

  marketplaces
    .command('remove <identifier>')
    .description('Remove a custom marketplace')
    .action(async (identifierArg: string) => {
      logger.titleBox('AgentInit  Configuration');

      try {
        const identifier = normalizeMarketplaceIdentifier(identifierArg);
        if (BUILT_IN_MARKETPLACE_IDS.has(identifier)) {
          throw new Error(`Marketplace "${identifier}" is built in and cannot be removed.`);
        }

        const configState = await readUserConfig();
        const nextMarketplaces = configState.customMarketplaces.filter(marketplace => marketplace.identifier !== identifier);
        if (nextMarketplaces.length === configState.customMarketplaces.length) {
          throw new Error(`Marketplace "${identifier}" is not configured.`);
        }

        configState.customMarketplaces = nextMarketplaces;
        const clearedDefault = configState.defaultMarketplace === identifier;
        if (clearedDefault) {
          delete configState.defaultMarketplace;
        }

        await writeUserConfig(sortConfig(configState));

        logger.success(`Removed marketplace ${green(identifier)}.`);
        if (clearedDefault) {
          logger.info('  Cleared the configured default marketplace.');
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Failed to remove marketplace.');
      }
    });

  marketplaces
    .command('default <identifier>')
    .description('Set the configured default marketplace')
    .action(async (identifierArg: string) => {
      logger.titleBox('AgentInit  Configuration');

      try {
        const identifier = normalizeMarketplaceIdentifier(identifierArg);
        if (!getMarketplace(identifier)) {
          throw new Error(`Unknown marketplace: ${identifier}. Available: ${getMarketplaceIds().join(', ')}`);
        }

        const configState = await readUserConfig();
        configState.defaultMarketplace = identifier;
        await writeUserConfig(sortConfig(configState));

        logger.success(`Set ${green(identifier)} as the configured default marketplace.`);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Failed to set default marketplace.');
      }
    });

  marketplaces
    .command('clear-default')
    .description('Clear the configured default marketplace')
    .action(async () => {
      logger.titleBox('AgentInit  Configuration');

      const configState = await readUserConfig();
      if (!configState.defaultMarketplace) {
        logger.info('No configured default marketplace to clear.');
        return;
      }

      delete configState.defaultMarketplace;
      await writeUserConfig(sortConfig(configState));
      logger.success('Cleared the configured default marketplace.');
    });

  const verifiedRepos = config
    .command('verified-repos')
    .description('Manage exact verified GitHub repositories');

  verifiedRepos
    .command('list')
    .description('List verified GitHub repositories')
    .action(async () => {
      logger.titleBox('AgentInit  Configuration');
      logger.section('Verified GitHub Repos');

      const configState = await readUserConfig();
      const entries = [
        ...getBuiltInVerifiedGithubRepos().map(repo => ({ repo, builtIn: true })),
        ...configState.verifiedGithubRepos
          .filter(repo => !BUILT_IN_VERIFIED_REPOS.has(repo))
          .map(repo => ({ repo, builtIn: false })),
      ];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        logger.tree(
          `${cyan(entry.repo)} ${dim(entry.builtIn ? '[built-in]' : '[custom]')}`,
          i === entries.length - 1,
        );
      }
    });

  verifiedRepos
    .command('add <repo>')
    .description('Add an exact verified GitHub repo in owner/repo form')
    .action(async (repoArg: string) => {
      logger.titleBox('AgentInit  Configuration');

      try {
        const repo = normalizeGitHubRepoRef(repoArg);
        if (BUILT_IN_VERIFIED_REPOS.has(repo)) {
          logger.info(`${repo} is already verified by AgentInit.`);
          return;
        }

        const configState = await readUserConfig();
        if (configState.verifiedGithubRepos.includes(repo)) {
          logger.info(`${repo} is already configured as verified.`);
          return;
        }

        configState.verifiedGithubRepos.push(repo);
        await writeUserConfig(sortConfig(configState));
        logger.success(`Added verified GitHub repo ${green(repo)}.`);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Failed to add verified repo.');
      }
    });

  verifiedRepos
    .command('remove <repo>')
    .description('Remove a custom verified GitHub repo')
    .action(async (repoArg: string) => {
      logger.titleBox('AgentInit  Configuration');

      try {
        const repo = normalizeGitHubRepoRef(repoArg);
        if (BUILT_IN_VERIFIED_REPOS.has(repo)) {
          throw new Error(`${repo} is built in and cannot be removed.`);
        }

        const configState = await readUserConfig();
        const nextRepos = configState.verifiedGithubRepos.filter(entry => entry !== repo);
        if (nextRepos.length === configState.verifiedGithubRepos.length) {
          throw new Error(`${repo} is not configured as verified.`);
        }

        configState.verifiedGithubRepos = nextRepos;
        await writeUserConfig(sortConfig(configState));
        logger.success(`Removed verified GitHub repo ${green(repo)}.`);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Failed to remove verified repo.');
      }
    });
}
