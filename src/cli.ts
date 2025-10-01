#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { detectCommand } from './commands/detect.js';
import { syncCommand } from './commands/sync.js';
import { applyCommand } from './commands/apply.js';
import { verifyMcpCommand } from './commands/verifyMcp.js';

const program = new Command();

program
  .name('agentinit')
  .description('A CLI tool for managing and configuring AI coding agents')
  .version('1.0.1');

program
  .command('apply')
  .description('Apply configurations (MCP servers, etc.)')
  .allowUnknownOption(true)
  .action((options, command) => {
    // Let Commander parse the arguments properly
    const parsed = command.parseOptions(command.parent.rawArgs.slice(3));
    applyCommand(parsed.unknown);
  });

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
  .command('verify_mcp')
  .description('Verify MCP server installations and list their capabilities')
  .allowUnknownOption(true)
  .action((options, command) => {
    // Let Commander parse the arguments properly
    const parsed = command.parseOptions(command.parent.rawArgs.slice(3));
    verifyMcpCommand(parsed.unknown);
  });

program.parse();