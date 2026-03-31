import ora from 'ora';
import { logger } from '../utils/logger.js';
import { ManagedStateStore } from '../core/managedState.js';
import { removeManagedIgnoreBlock } from '../core/gitignoreManager.js';

interface RevertOptions {
  dryRun?: boolean;
  keepBackups?: boolean;
}

export async function revertCommand(options: RevertOptions): Promise<void> {
  const cwd = process.cwd();

  logger.titleBox('AgentInit  Revert');

  if (options.dryRun) {
    logger.info('Running in dry-run mode - no files will be modified');
  }

  const spinner = ora('Reverting managed agent files...').start();

  try {
    const managedState = await ManagedStateStore.open(cwd);
    const revertOptions: Parameters<ManagedStateStore['revertAll']>[0] = {};
    if (options.dryRun !== undefined) {
      revertOptions.dryRun = options.dryRun;
    }
    if (options.keepBackups !== undefined) {
      revertOptions.keepBackups = options.keepBackups;
    }
    const summary = await managedState.revertAll(revertOptions);

    const gitignoreOptions: Parameters<typeof removeManagedIgnoreBlock>[1] = {};
    if (options.dryRun !== undefined) {
      gitignoreOptions.dryRun = options.dryRun;
    }
    const gitignoreRemoved = await removeManagedIgnoreBlock(cwd, gitignoreOptions);

    const excludeOptions: Parameters<typeof removeManagedIgnoreBlock>[1] = {
      local: true,
    };
    if (options.dryRun !== undefined) {
      excludeOptions.dryRun = options.dryRun;
    }
    const excludeRemoved = await removeManagedIgnoreBlock(cwd, excludeOptions).catch(() => false);

    spinner.succeed(options.dryRun ? 'Revert preview complete' : 'Revert complete');

    logger.info(`Restored from backup: ${summary.restored}`);
    logger.info(`Removed generated paths: ${summary.removed}`);
    if (!options.keepBackups) {
      logger.info(`Removed backups: ${summary.backupsRemoved}`);
    }
    logger.info(`Removed .gitignore block: ${gitignoreRemoved ? 'yes' : 'no'}`);
    logger.info(`Removed .git/info/exclude block: ${excludeRemoved ? 'yes' : 'no'}`);
  } catch (error) {
    spinner.fail('Revert failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
  }
}
