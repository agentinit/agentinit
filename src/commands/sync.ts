import ora from 'ora';
import { logger } from '../utils/logger.js';
import { Propagator } from '../core/propagator.js';

interface SyncOptions {
  dryRun?: boolean;
  backup?: boolean;
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  const cwd = process.cwd();
  
  logger.title('🔄 AgentInit - Sync Configuration');
  
  if (options.dryRun) {
    logger.info('Running in dry-run mode - no files will be modified');
  }
  
  const spinner = ora('Syncing agents.md with agent configurations...').start();
  
  try {
    const propagator = new Propagator();
    const result = await propagator.syncAgentsFile(cwd, options);
    
    if (result.success) {
      spinner.succeed('Synchronization complete');
      
      if (result.changes.length === 0) {
        logger.info('No changes needed - all configurations are up to date');
      } else {
        logger.success(`Applied ${result.changes.length} changes:`);
        
        for (const change of result.changes) {
          const action = change.action === 'created' ? '➕' : 
                        change.action === 'updated' ? '📝' : '💾';
          logger.info(`  ${action} ${change.agent}: ${change.file}`);
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