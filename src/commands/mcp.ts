import ora from 'ora';
import prompts from 'prompts';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { MCPRegistryManager } from '../registry/mcpRegistry.js';
import { StackDetector } from '../core/stackDetector.js';
import type { MCPItem } from '../types/index.js';

const execAsync = promisify(exec);

interface MCPOptions {
  interactive?: boolean;
  search?: string;
  install?: string;
}

export async function mcpCommand(options: MCPOptions): Promise<void> {
  const cwd = process.cwd();
  
  logger.title('📦 AgentInit - MCP Management');
  
  const registryManager = new MCPRegistryManager();
  
  if (options.search) {
    await searchMCPs(registryManager, options.search);
    return;
  }
  
  if (options.install) {
    await installMCP(registryManager, options.install);
    return;
  }
  
  if (options.interactive) {
    await interactiveMCPSelection(registryManager, cwd);
    return;
  }
  
  // Default: show top MCPs
  showTopMCPs(registryManager);
}

async function searchMCPs(registry: MCPRegistryManager, query: string): Promise<void> {
  const results = registry.searchMCPs(query);
  
  if (results.length === 0) {
    logger.info(`No MCPs found matching "${query}"`);
    return;
  }
  
  logger.success(`Found ${results.length} MCPs matching "${query}":`);
  results.forEach(mcp => displayMCP(mcp));
}

async function installMCP(registry: MCPRegistryManager, name: string): Promise<void> {
  const mcp = registry.getMCPByName(name);
  
  if (!mcp) {
    logger.error(`MCP "${name}" not found in registry`);
    return;
  }
  
  const spinner = ora(`Installing ${mcp.name}...`).start();
  
  try {
    await execAsync(mcp.installCommand);
    spinner.succeed(`${mcp.name} installed successfully`);
    
    logger.info('Agent Instructions:');
    logger.info(mcp.agentInstructions);
    
  } catch (error) {
    spinner.fail(`Failed to install ${mcp.name}`);
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function interactiveMCPSelection(registry: MCPRegistryManager, projectPath: string): Promise<void> {
  // Detect stack to show relevant MCPs
  const stackDetector = new StackDetector();
  const stack = await stackDetector.detectStack(projectPath);
  
  logger.info(`Detected stack: ${stack.language}${stack.framework ? ` with ${stack.framework}` : ''}`);
  
  // Get recommendations based on stack
  const stackMCPs = registry.getMCPsForStack(stack.language);
  const topMCPs = registry.getTopMCPs(4);
  
  // Combine and deduplicate
  const recommendedMCPs = [...new Set([...stackMCPs, ...topMCPs])].slice(0, 6);
  
  const choices = recommendedMCPs.map(mcp => ({
    title: `${mcp.name} - ${mcp.description}`,
    value: mcp,
    selected: false
  }));
  
  choices.push({
    title: '🔍 Search for more MCPs',
    value: 'search',
    selected: false
  });
  
  const response = await prompts({
    type: 'multiselect',
    name: 'mcps',
    message: '🔥 Select MCPs to install:',
    choices,
    hint: 'Space to select, Enter to confirm'
  });
  
  if (!response.mcps || response.mcps.length === 0) {
    logger.info('No MCPs selected');
    return;
  }
  
  // Handle search option
  if (response.mcps.includes('search')) {
    const searchResponse = await prompts({
      type: 'text',
      name: 'query',
      message: 'Search MCPs:'
    });
    
    if (searchResponse.query) {
      await searchMCPs(registry, searchResponse.query);
    }
    return;
  }
  
  // Install selected MCPs
  for (const mcp of response.mcps) {
    if (typeof mcp === 'object') {
      await installMCP(registry, mcp.name);
    }
  }
  
  logger.success('✨ MCP installation complete!');
  logger.info('Next steps:');
  logger.info('  1. Update your agents.md with MCP-specific instructions');
  logger.info('  2. Run `agentinit sync` to apply changes to agent configs');
}

function showTopMCPs(registry: MCPRegistryManager): void {
  const topMCPs = registry.getTopMCPs(5);
  
  logger.subtitle('🔥 Top Recommended MCPs:');
  topMCPs.forEach(mcp => displayMCP(mcp));
  
  logger.info('');
  logger.info('Commands:');
  logger.info('  agentinit mcp --interactive     Interactive MCP selection');
  logger.info('  agentinit mcp --search <query>  Search for MCPs');
  logger.info('  agentinit mcp --install <name>  Install specific MCP');
}

function displayMCP(mcp: MCPItem): void {
  const verification = mcp.verified ? '✓' : '?';
  logger.info(`  ${verification} ${mcp.name} (${mcp.category})`);
  logger.info(`    ${mcp.description}`);
  logger.info(`    Install: ${mcp.installCommand}`);
  logger.info(`    Stack: ${mcp.stackCompatibility.join(', ')}`);
  logger.info('');
}