#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { detectCommand } from './commands/detect.js';
import { syncCommand } from './commands/sync.js';
import { applyCommand } from './commands/apply.js';
import { verifyMcpCommand } from './commands/verifyMcp.js';
import { registerSkillsCommand } from './commands/skills.js';
import { registerMcpCommand } from './commands/mcp.js';
import { registerRulesCommand } from './commands/rules.js';
import { registerPluginsCommand } from './commands/plugins.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('agentinit')
  .description('A CLI tool for managing and configuring AI coding agents')
  .version('1.0.1');

// New subcommand groups
registerSkillsCommand(program);
registerMcpCommand(program);
registerRulesCommand(program);
registerPluginsCommand(program);

// Core commands (unchanged)
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

// Deprecated commands (backward compatible)
program
  .command('apply')
  .description('(deprecated) Use: mcp add, rules add, skills add')
  .allowUnknownOption(true)
  .action((options, command) => {
    logger.warn('⚠ "agentinit apply" is deprecated. Use:');
    logger.warn('  agentinit mcp add    — for MCP servers');
    logger.warn('  agentinit rules add  — for coding rules');
    logger.warn('  agentinit skills add — for agent skills');
    logger.warn('');
    logger.warn('Running in compatibility mode...\n');
    const parsed = command.parseOptions(command.parent.rawArgs.slice(3));
    applyCommand(parsed.unknown);
  });

program
  .command('verify_mcp')
  .description('(deprecated) Use: mcp verify')
  .allowUnknownOption(true)
  .action((options, command) => {
    logger.warn('⚠ "agentinit verify_mcp" is deprecated. Use "agentinit mcp verify"\n');
    const parsed = command.parseOptions(command.parent.rawArgs.slice(3));
    verifyMcpCommand(parsed.unknown);
  });

program.parse();
