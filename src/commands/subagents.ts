import { logger } from '../utils/logger.js';

interface SubagentsOptions {
  list?: boolean;
  run?: string;
  chain?: string;
  parallel?: string;
}

export async function subagentsCommand(options: SubagentsOptions): Promise<void> {
  logger.title('🤖 AgentInit - Sub-agents');
  logger.info('Sub-agent management coming soon...');
}