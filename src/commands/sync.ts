import ora from 'ora';
import { relative } from 'path';
import { logger } from '../utils/logger.js';
import { Propagator } from '../core/propagator.js';
import { ManagedStateStore } from '../core/managedState.js';
import { AgentManager } from '../core/agentManager.js';

interface SyncOptions {
  dryRun?: boolean;
  backup?: boolean;
  agent?: string[];
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  const cwd = process.cwd();
  const agentManager = new AgentManager();
  
  logger.titleBox('AgentInit  Sync');
  
  if (options.dryRun) {
    logger.info('Running in dry-run mode - no files will be modified');
  }
  
  const spinner = ora('Syncing agents.md with agent configurations...').start();
  
  try {
    const managedState = await ManagedStateStore.open(cwd);
    const propagator = new Propagator();
    const syncOptions: Parameters<Propagator['syncAgentsFile']>[1] = {
      managedState,
    };
    if (options.dryRun !== undefined) {
      syncOptions.dryRun = options.dryRun;
    }
    if (options.backup !== undefined) {
      syncOptions.backup = options.backup;
    }
    if (options.agent && options.agent.length > 0) {
      syncOptions.targets = options.agent;
    }
    const result = await propagator.syncAgentsFile(cwd, syncOptions);

    if (!options.dryRun) {
      await managedState.save();
    }
    
    if (result.success) {
      spinner.succeed('Synchronization complete');

      if (result.warnings.length > 0) {
        result.warnings.forEach(warning => logger.warning(warning));
      }
      
      if (result.changes.length === 0) {
        logger.info('No changes needed - all configurations are up to date');
      } else {
        logger.success(`Applied ${result.changes.length} changes:`);
        
        for (const change of result.changes) {
          const action = change.action === 'created' ? '➕' :
            change.action === 'updated' ? '📝' : '💾';
          const names = change.agents
            .map(id => agentManager.getAgentById(id)?.name || id)
            .join(', ');
          logger.info(`  ${action} ${relative(cwd, change.file) || change.file}`);
          logger.info(`     Agents: ${names}`);
        }
        
        if (options.backup && result.changes.some(c => c.action === 'backed_up')) {
          logger.info('💾 Backup files created with .agentinit.backup extension');
        }
      }
    } else {
      spinner.fail('Synchronization failed');
      
      for (const error of result.errors) {
        logger.error(error);
      }
      for (const warning of result.warnings) {
        logger.warning(warning);
      }
      
      if (result.changes.length > 0) {
        logger.warning('Partial sync completed. Some changes were applied:');
        for (const change of result.changes) {
          logger.info(`  - ${change.agent}: ${change.file}`);
        }
      }
    }
    
  } catch (error) {
    spinner.fail('Sync failed');
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
