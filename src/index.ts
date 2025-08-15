#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { detectCommand } from './commands/detect.js';
import { syncCommand } from './commands/sync.js';
import { configCommand } from './commands/config.js';
import { mcpCommand } from './commands/mcp.js';
import { subagentsCommand } from './commands/subagents.js';

const program = new Command();

program
  .name('agentinit')
  .description('A CLI tool for managing and configuring AI coding agents')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize agents.md configuration for the current project')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-t, --template <template>', 'Use specific template (web, cli, library)')
  .action(initCommand);

program
  .command('detect')
  .description('Detect current project stack and existing agent configurations')
  .option('-v, --verbose', 'Show detailed detection results')
  .action(detectCommand);

program
  .command('sync')
  .description('Sync agents.md with agent-specific configuration files')
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-b, --backup', 'Create backup before syncing')
  .action(syncCommand);

program
  .command('config')
  .description('Manage preferences and configuration')
  .argument('[key]', 'Configuration key to get/set')
  .argument('[value]', 'Value to set for the key')
  .option('-g, --global', 'Use global configuration')
  .option('-l, --local', 'Use project-specific configuration')
  .option('--list', 'List all configuration values')
  .action(configCommand);

program
  .command('mcp')
  .description('Manage MCP (Model Context Protocol) installations')
  .option('-i, --interactive', 'Interactive MCP selection')
  .option('-s, --search <query>', 'Search MCP registry')
  .option('--install <name>', 'Install specific MCP')
  .action(mcpCommand);

program
  .command('subagents')
  .description('Manage sub-agents for specialized tasks')
  .option('--list', 'List available sub-agents')
  .option('--run <agents>', 'Run specific sub-agents')
  .option('--chain <agents>', 'Run sub-agents in sequence')
  .option('--parallel <agents>', 'Run sub-agents in parallel')
  .action(subagentsCommand);

program.parse();