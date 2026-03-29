import { Command } from 'commander';
import ora from 'ora';
import { relative } from 'path';
import { green } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { SkillsManager } from '../core/skillsManager.js';
import { getMarketplaceIds } from '../core/marketplaceRegistry.js';
import { AgentManager } from '../core/agentManager.js';

export function registerSkillsCommand(program: Command): void {
  const marketplaceHelp = getMarketplaceIds().join(', ');
  const skills = program
    .command('skills')
    .description('Manage agent skills');

  // --- skills add <source> ---
  skills
    .command('add <source>')
    .description('Add skills from a marketplace, GitHub repo, or local path')
    .option('--from <marketplace>', `Marketplace source override (available: ${marketplaceHelp})`)
    .option('-g, --global', 'Install skills globally')
    .option('-a, --agent <agents...>', 'Target specific agent(s)')
    .option('-s, --skill <names...>', 'Install only specific skills by name')
    .option('-l, --list', 'List available skills from the source without installing')
    .option('--copy', 'Copy skill files instead of symlinking')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (source: string, options) => {
      logger.title('📦 AgentInit - Skills');

      const agentManager = new AgentManager();
      const skillsManager = new SkillsManager(agentManager);

      // If --list, discover and display skills from source, then return
      if (options.list) {
        const spinner = ora('Discovering skills...').start();
        try {
          const result = await skillsManager.discoverFromSource(source, process.cwd(), {
            from: options.from,
          });
          const discoveredSkills = result.skills;
          spinner.stop();

          if (discoveredSkills.length === 0) {
            logger.info('No skills found in the source.');
            for (const warning of result.warnings) {
              logger.warn(warning);
            }
            return;
          }

          logger.info(`Found ${green(String(discoveredSkills.length))} skill(s):\n`);
          logger.info('  Name                Description');
          logger.info('  ──────────────────  ──────────────────────────────────');
          for (const skill of discoveredSkills) {
            const name = skill.name.padEnd(18);
            logger.info(`  ${green(name)}  ${skill.description}`);
          }

          if (result.warnings.length > 0) {
            logger.info('');
            for (const warning of result.warnings) {
              logger.warn(warning);
            }
          }
        } catch (error) {
          spinner.fail('Failed to discover skills');
          logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return;
      }

      // Install skills
      const spinner = ora('Installing skills...').start();
      try {
        const result = await skillsManager.addFromSource(source, process.cwd(), {
          from: options.from,
          global: options.global,
          agents: options.agent,
          skills: options.skill,
          copy: options.copy,
          yes: options.yes,
        });

        if (result.installed.length === 0 && result.skipped.length === 0) {
          spinner.warn('No skills found in the source.');
          for (const warning of result.warnings) {
            logger.warn(warning);
          }
          return;
        }

        const uniqueInstallCount = new Set(
          result.installed.map(item => `${item.path}:${item.skill.name}`)
        ).size;
        spinner.succeed(`Installed ${green(String(uniqueInstallCount))} skill(s)`);

        // Show per-path breakdown
        const byPath = new Map<string, { agents: Set<string>; skills: Set<string> }>();
        for (const item of result.installed) {
          const path = item.path;
          const existing = byPath.get(path) || {
            agents: new Set<string>(),
            skills: new Set<string>(),
          };
          existing.agents.add(agentManager.getAgentById(item.agent)?.name || item.agent);
          existing.skills.add(item.skill.name);
          byPath.set(path, existing);
        }
        for (const [path, details] of byPath) {
          logger.info(`  ${relative(process.cwd(), path) || path}`);
          logger.info(`    Agents: ${[...details.agents].join(', ')}`);
          logger.info(`    Skills: ${green(String(details.skills.size))} installed (${[...details.skills].join(', ')})`);
        }

        const copiedFallbacks = result.installed.filter(item => item.symlinkFailed);
        if (copiedFallbacks.length > 0) {
          logger.warn(`Symlink creation failed for ${copiedFallbacks.length} install(s); copied the skill files instead.`);
        }

        // Show skipped skills
        if (result.skipped.length > 0) {
          logger.info('');
          logger.warn(`Skipped ${result.skipped.length} skill(s):`);
          for (const skip of result.skipped) {
            logger.info(`  ${skip.skill.name}: ${skip.reason}`);
          }
        }

        if (result.warnings.length > 0) {
          logger.info('');
          for (const warning of result.warnings) {
            logger.warn(warning);
          }
        }

        logger.success('Skills installation complete.');
      } catch (error) {
        spinner.fail('Failed to install skills');
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

  // --- skills list (alias: ls) ---
  skills
    .command('list')
    .alias('ls')
    .description('List installed skills')
    .option('-g, --global', 'List only global skills')
    .option('-a, --agent <agents...>', 'Filter by specific agent(s)')
    .action(async (options) => {
      logger.title('📦 AgentInit - Skills');

      const agentManager = new AgentManager();
      const skillsManager = new SkillsManager(agentManager);

      const installed = await skillsManager.listInstalled(process.cwd(), {
        global: options.global,
        agents: options.agent,
      });

      if (installed.length === 0) {
        logger.info('No skills installed.');
        return;
      }

      const bySkill = new Map<string, {
        name: string;
        description: string;
        path: string;
        scope: 'project' | 'global';
        mode: 'copy' | 'symlink';
        isSymlink: boolean;
        agents: Set<string>;
      }>();

      for (const skill of installed) {
        const canonicalPath = skill.canonicalPath || skill.path;
        const key = `${skill.scope}:${canonicalPath}`;
        const existing = bySkill.get(key) || {
          name: skill.name,
          description: skill.description,
          path: canonicalPath,
          scope: skill.scope,
          mode: skill.mode,
          isSymlink: skill.isSymlink,
          agents: new Set<string>(),
        };

        existing.isSymlink = existing.isSymlink || skill.isSymlink;
        if (skill.mode === 'symlink') {
          existing.mode = 'symlink';
        }
        existing.agents.add(agentManager.getAgentById(skill.agent)?.name || skill.agent);
        bySkill.set(key, existing);
      }

      for (const skill of bySkill.values()) {
        const mode = skill.mode === 'symlink' ? ' (canonical)' : '';
        const scope = skill.scope === 'global' ? ' [global]' : '';
        logger.info(`\n  ${green(skill.name)} - ${skill.description}${scope}${mode}`);
        logger.info(`    Path: ${relative(process.cwd(), skill.path) || skill.path}`);
        logger.info(`    Agents: ${[...skill.agents].join(', ')}`);
      }
    });

  // --- skills remove [names...] (alias: rm) ---
  skills
    .command('remove [names...]')
    .alias('rm')
    .description('Remove installed skills by name')
    .option('-g, --global', 'Remove from global scope')
    .option('-a, --agent <agents...>', 'Target specific agent(s)')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (names: string[], options) => {
      logger.title('📦 AgentInit - Skills');

      if (!names || names.length === 0) {
        if (!options.yes) {
          logger.error('Please specify skill name(s) to remove.');
          logger.info('Usage: agentinit skills remove <name...>');
          return;
        }
      }

      const agentManager = new AgentManager();
      const skillsManager = new SkillsManager(agentManager);

      const result = await skillsManager.remove(names, process.cwd(), {
        global: options.global,
        agents: options.agent,
        yes: options.yes,
      });

      if (result.removed.length > 0) {
        logger.success(`Removed ${green(String(result.removed.length))} skill(s).`);
        for (const entry of result.removed) {
          logger.info(`  ${entry}`);
        }
      }

      if (result.notFound.length > 0) {
        logger.warn(`Not found: ${result.notFound.join(', ')}`);
      }

      if (result.skipped.length > 0) {
        logger.warn(`Skipped: ${result.skipped.length}`);
        for (const entry of result.skipped) {
          logger.info(`  ${entry.name}: ${entry.reason}`);
        }
      }

      if (result.removed.length === 0 && result.notFound.length === 0 && result.skipped.length === 0) {
        logger.info('Nothing to remove.');
      }
    });
}
