import { Command } from 'commander';
import ora from 'ora';
import { green, red } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { AgentsMdManager } from '../core/agentsMdManager.js';

export function registerAgentsMdCommand(program: Command): void {
  const agentsMd = program
    .command('agents-md')
    .description('Manage AGENTS.md and per-agent rule files');

  // --- agents-md init ---
  agentsMd
    .command('init')
    .description('Initialize AGENTS.md if it does not exist')
    .action(async () => {
      const projectPath = process.cwd();
      const manager = new AgentsMdManager(projectPath);
      const spinner = ora('Checking AGENTS.md...').start();

      try {
        const content = await manager.read();
        if (content) {
          spinner.succeed('AGENTS.md already exists');
          return;
        }
        await manager.setSection({
          heading: 'Project Overview',
          body: 'Add your project context here.',
        });
        spinner.succeed('Created AGENTS.md');
      } catch (error) {
        spinner.fail('Failed to initialize AGENTS.md');
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // --- agents-md set-section ---
  agentsMd
    .command('set-section')
    .description('Add or update a section in AGENTS.md')
    .argument('<heading>', 'Section heading')
    .option('-b, --body <body>', 'Section body text', '')
    .option('-f, --file <path>', 'Read body from file')
    .option('--placement <placement>', 'Placement: append, prepend, or "after <heading>"', 'append')
    .action(async (heading: string, options) => {
      const projectPath = process.cwd();
      const manager = new AgentsMdManager(projectPath);
      const spinner = ora(`Updating section "${heading}"...`).start();

      try {
        let body = options.body as string;
        if (options.file) {
          const { readFileIfExists } = await import('../utils/fs.js');
          const fileContent = await readFileIfExists(options.file);
          if (!fileContent) {
            spinner.fail(`File not found: ${options.file}`);
            process.exit(1);
          }
          body = fileContent;
        }

        await manager.setSection({
          heading,
          body,
          placement: options.placement,
        });
        spinner.succeed(`Updated section "${heading}" in AGENTS.md`);
      } catch (error) {
        spinner.fail(`Failed to update section "${heading}"`);
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // --- agents-md remove-section ---
  agentsMd
    .command('remove-section')
    .description('Remove a section from AGENTS.md')
    .argument('<heading>', 'Section heading to remove')
    .action(async (heading: string) => {
      const projectPath = process.cwd();
      const manager = new AgentsMdManager(projectPath);
      const spinner = ora(`Removing section "${heading}"...`).start();

      try {
        const removed = await manager.removeSection({ heading });
        if (removed) {
          spinner.succeed(`Removed section "${heading}"`);
        } else {
          spinner.warn(`Section "${heading}" not found`);
        }
      } catch (error) {
        spinner.fail(`Failed to remove section "${heading}"`);
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // --- agents-md read ---
  agentsMd
    .command('read')
    .description('Read AGENTS.md content')
    .action(async () => {
      const projectPath = process.cwd();
      const manager = new AgentsMdManager(projectPath);

      try {
        const content = await manager.read();
        if (!content) {
          logger.info('AGENTS.md does not exist');
          return;
        }
        logger.info(content);
      } catch (error) {
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // --- agents-md symlink-claude ---
  agentsMd
    .command('symlink-claude')
    .description('Create CLAUDE.md symlink pointing to AGENTS.md')
    .action(async () => {
      const projectPath = process.cwd();
      const manager = new AgentsMdManager(projectPath);
      const spinner = ora('Creating CLAUDE.md -> AGENTS.md symlink...').start();

      try {
        await manager.symlinkClaude();
        spinner.succeed('CLAUDE.md now symlinks to AGENTS.md');
      } catch (error) {
        spinner.fail('Failed to create symlink');
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // --- agents-md parse ---
  agentsMd
    .command('parse')
    .description('Parse and list AGENTS.md sections')
    .action(async () => {
      const projectPath = process.cwd();
      const manager = new AgentsMdManager(projectPath);

      try {
        const content = await manager.read();
        if (!content) {
          logger.info('AGENTS.md does not exist');
          return;
        }

        const sections = manager.parseSections(content);
        if (sections.length === 0) {
          logger.info('No sections found in AGENTS.md');
          return;
        }

        for (const section of sections) {
          logger.info(`${'#'.repeat(section.level)} ${green(section.heading)}`);
          const bodyPreview = section.body.split('\n').slice(0, 3).join('\n');
          if (bodyPreview) {
            logger.info(bodyPreview);
          }
          logger.info('');
        }
      } catch (error) {
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}
