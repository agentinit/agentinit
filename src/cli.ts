#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { detectCommand } from './commands/detect.js';
import { syncCommand } from './commands/sync.js';
import { applyCommand, applyProjectCommand, hasLegacyApplyArgs } from './commands/apply.js';
import { verifyMcpCommand } from './commands/verifyMcp.js';
import { revertCommand } from './commands/revert.js';
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
  .option('-a, --agent <agents...>', 'Target specific agent(s)')
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-b, --backup', 'Create backup before syncing')
  .action(syncCommand);

program
  .command('apply')
  .description('Apply agents.md and project-owned skills to supported agent files')
  .option('-a, --agent <agents...>', 'Target specific agent(s)')
  .option('-d, --dry-run', 'Preview changes without writing files')
  .option('-b, --backup', 'Create sibling .agentinit.backup files before overwriting')
  .option('--no-skills', 'Disable project-owned skills propagation')
  .option('--copy-skills', 'Copy project-owned skills instead of using canonical symlink installs')
  .option('--no-gitignore', 'Disable managed ignore block updates')
  .option('--gitignore-local', 'Write ignore entries to .git/info/exclude instead of .gitignore')
  .allowUnknownOption(true)
  .action(async (options, command) => {
    const rawArgs = command.parent.rawArgs.slice(3);

    if (hasLegacyApplyArgs(rawArgs)) {
      logger.warn('⚠ Legacy apply mode detected. Prefer:');
      logger.warn('  agentinit apply      — for sync + project skills + ignore management');
      logger.warn('  agentinit mcp add    — for MCP servers');
      logger.warn('  agentinit rules add  — for coding rules');
      logger.warn('');
      const parsed = command.parseOptions(rawArgs);
      await applyCommand(parsed.unknown);
      return;
    }

    await applyProjectCommand(options);
  });

program
  .command('revert')
  .description('Revert managed files created by agentinit apply/sync')
  .option('-d, --dry-run', 'Preview changes without modifying files')
  .option('--keep-backups', 'Keep internal backups after restoring files')
  .action(revertCommand);

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
