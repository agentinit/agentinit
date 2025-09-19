import ora from 'ora';
import { logger } from '../utils/logger.js';
import { AgentDetector } from '../core/agentDetector.js';
import { StackDetector } from '../core/stackDetector.js';

interface DetectOptions {
  verbose?: boolean;
}

export async function detectCommand(options: DetectOptions): Promise<void> {
  const cwd = process.cwd();
  
  logger.title('🔍 AgentInit - Project Detection');
  
  const spinner = ora('Detecting project configuration...').start();
  
  try {
    const agentDetector = new AgentDetector();
    const stackDetector = new StackDetector();
    
    const [agents, stack] = await Promise.all([
      agentDetector.detectAgents(cwd),
      stackDetector.detectStack(cwd)
    ]);
    
    spinner.succeed('Detection complete');
    
    // Display results
    logger.subtitle('📋 Stack Information:');
    logger.info(`Language: ${stack.language}`);
    if (stack.framework) logger.info(`Framework: ${stack.framework}`);
    if (stack.packageManager) logger.info(`Package Manager: ${stack.packageManager}`);
    if (stack.testFramework) logger.info(`Test Framework: ${stack.testFramework}`);
    
    if (options.verbose && stack.dependencies.length > 0) {
      logger.info(`Dependencies: ${stack.dependencies.join(', ')}`);
    }
    
    logger.subtitle('🤖 Agent Configuration:');
    
    // Filter agents based on DEBUG environment variable
    const isDebugMode = process.env.DEBUG === '1';
    const filteredAgents = isDebugMode ? agents : agents.filter(agent => agent.detected);
    
    if (filteredAgents.length === 0) {
      if (isDebugMode) {
        logger.info('No agent configurations found');
      } else {
        logger.info('No existing agent configurations found');
      }
    } else {
      filteredAgents.forEach(agent => {
        logger.info(`${agent.name}: ${agent.detected ? '✓ Found' : '✗ Not found'}`);
        if (options.verbose) {
          agent.files.forEach(file => logger.debug(`  - ${file}`));
        }
      });
    }
    
  } catch (error) {
    spinner.fail('Detection failed');
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}