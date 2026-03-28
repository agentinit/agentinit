import { Command } from 'commander';
import ora from 'ora';
import { green, dim, bold, cyan } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { PluginManager } from '../core/pluginManager.js';
import { AgentManager } from '../core/agentManager.js';

export function registerPluginsCommand(program: Command): void {
  const marketplaceHelp = new PluginManager().getMarketplaceIds().join(', ');

  const plugins = program
    .command('plugins')
    .description('Install agent-agnostic plugins from any marketplace or source');

  // --- plugins install <source> ---
  plugins
    .command('install <source>')
    .description('Install a plugin from <marketplace>/<name>, a GitHub repo, or a local path')
    .option('--from <marketplace>', `Marketplace source override (available: ${marketplaceHelp})`)
    .option('-a, --agent <agents...>', 'Target specific agent(s)')
    .option('-g, --global', 'Install globally')
    .option('-l, --list', 'Preview plugin contents without installing')
    .option('-y, --yes', 'Skip confirmation prompts, auto-detect all agents')
    .action(async (source: string, options) => {
      logger.title('🔌 AgentInit - Plugins');

      const agentManager = new AgentManager();
      const pluginManager = new PluginManager(agentManager);

      // If --list, preview contents
      if (options.list) {
        const spinner = ora('Fetching plugin...').start();
        try {
          const result = await pluginManager.installPlugin(source, process.cwd(), {
            from: options.from,
            list: true,
          });

          spinner.stop();
          const p = result.plugin;

          console.log('');
          logger.info(`${bold(p.name)} ${dim(`v${p.version}`)} ${dim(`[${p.format} format]`)}`);
          if (p.description) logger.info(`  ${p.description}`);
          console.log('');

          if (p.skills.length > 0) {
            logger.info(`  ${green('Skills')} (${p.skills.length}):`);
            for (const skill of p.skills) {
              logger.info(`    ${green(skill.name)} - ${skill.description}`);
            }
          }

          if (p.mcpServers.length > 0) {
            logger.info(`  ${cyan('MCP Servers')} (${p.mcpServers.length}):`);
            for (const mcp of p.mcpServers) {
              logger.info(`    ${cyan(mcp.name)} [${mcp.type}]`);
            }
          }

          if (p.warnings.length > 0) {
            console.log('');
            for (const w of p.warnings) {
              logger.warn(w);
            }
          }

          if (p.skills.length === 0 && p.mcpServers.length === 0) {
            logger.info('  No portable components found (no skills or MCP servers).');
          }
        } catch (error) {
          spinner.fail('Failed to fetch plugin');
          logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return;
      }

      // Interactive agent selection if not --yes and not --agent
      let agentIds = options.agent as string[] | undefined;
      if (!agentIds && !options.yes) {
        try {
          agentIds = await interactiveAgentSelect(pluginManager, process.cwd(), options.global);
          if (!agentIds || agentIds.length === 0) {
            logger.info('No agents selected. Aborting.');
            return;
          }
        } catch {
          // Fallback to auto-detect if interactive fails (e.g., no TTY)
          logger.info('Auto-detecting agents...');
        }
      }

      // Install
      const spinner = ora('Installing plugin...').start();
      try {
        const result = await pluginManager.installPlugin(source, process.cwd(), {
          from: options.from,
          agents: agentIds,
          global: options.global,
          yes: options.yes,
        });

        const p = result.plugin;
        const totalSkills = result.skills.installed.length;
        const totalMcp = result.mcpServers.applied.length;

        if (totalSkills === 0 && totalMcp === 0) {
          spinner.warn(`Plugin "${p.name}" has no portable components to install.`);
          if (result.warnings.length > 0) {
            for (const w of result.warnings) {
              logger.warn(w);
            }
          }
          return;
        }

        spinner.succeed(`Installed plugin ${green(bold(p.name))} ${dim(`v${p.version}`)}`);

        // Skills breakdown
        if (totalSkills > 0) {
          const byAgent = new Map<string, number>();
          for (const item of result.skills.installed) {
            byAgent.set(item.agent, (byAgent.get(item.agent) || 0) + 1);
          }
          for (const [agent, count] of byAgent) {
            logger.info(`  ${agent}: ${green(String(count))} skill(s)`);
          }
        }

        // MCP breakdown
        if (totalMcp > 0) {
          const byAgent = new Map<string, string[]>();
          for (const item of result.mcpServers.applied) {
            const list = byAgent.get(item.agent) || [];
            list.push(item.name);
            byAgent.set(item.agent, list);
          }
          for (const [agent, servers] of byAgent) {
            logger.info(`  ${agent}: ${cyan(String(servers.length))} MCP server(s) [${servers.join(', ')}]`);
          }
        }

        // Skipped
        if (result.skills.skipped.length > 0 || result.mcpServers.skipped.length > 0) {
          console.log('');
          for (const s of result.skills.skipped) {
            logger.debug(`Skipped skill ${s.name}: ${s.reason}`);
          }
          for (const s of result.mcpServers.skipped) {
            logger.debug(`Skipped MCP ${s.name}: ${s.reason}`);
          }
        }

        // Warnings
        if (result.warnings.length > 0) {
          console.log('');
          for (const w of result.warnings) {
            logger.warn(w);
          }
        }

        logger.success('Plugin installation complete.');
      } catch (error) {
        spinner.fail('Failed to install plugin');
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

  // --- plugins search [query] ---
  plugins
    .command('search [query]')
    .description('Search marketplace plugins')
    .option('--from <marketplace>', `Which marketplace to search (available: ${marketplaceHelp})`)
    .option('--category <category>', 'Filter: official, community')
    .action(async (query: string | undefined, options) => {
      logger.title('🔌 AgentInit - Plugin Search');

      const pluginManager = new PluginManager();
      if (!options.from) {
        logger.info(`Please specify a marketplace with --from <marketplace>. Available: ${marketplaceHelp}`);
        logger.info('Examples:');
        logger.info('  agentinit plugins search --from claude');
        logger.info('  agentinit plugins search code-review --from claude');
        return;
      }

      const registryId = options.from;

      const spinner = ora(`Fetching ${registryId} marketplace...`).start();
      try {
        const results = await pluginManager.listMarketplacePlugins(registryId, query, options.category);
        spinner.stop();

        if (results.length === 0) {
          logger.info(query ? `No plugins matching "${query}".` : 'No plugins found.');
          return;
        }

        logger.info(`Found ${green(String(results.length))} plugin(s):\n`);

        // Group by category
        const byCategory = new Map<string, typeof results>();
        for (const p of results) {
          const list = byCategory.get(p.category) || [];
          list.push(p);
          byCategory.set(p.category, list);
        }

        for (const [category, categoryPlugins] of byCategory) {
          logger.info(bold(`  ${category}`));
          for (const p of categoryPlugins) {
            const name = green(p.name.padEnd(28));
            const desc = p.description ? dim(p.description.slice(0, 60)) : '';
            logger.info(`    ${name} ${desc}`);
          }
          console.log('');
        }

        logger.info(dim(`Install with: agentinit plugins install ${registryId}/<name>`));
      } catch (error) {
        spinner.fail('Failed to search marketplace');
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

  // --- plugins list (alias: ls) ---
  plugins
    .command('list')
    .alias('ls')
    .description('List installed plugins')
    .option('-a, --agent <agents...>', 'Filter by specific agent(s)')
    .option('-g, --global', 'List global plugins')
    .action(async (options) => {
      logger.title('🔌 AgentInit - Installed Plugins');

      const pluginManager = new PluginManager();
      const installed = await pluginManager.listPlugins(process.cwd(), {
        global: options.global,
        agents: options.agent,
      });

      if (installed.length === 0) {
        logger.info('No plugins installed.');
        return;
      }

      for (const p of installed) {
        const scope = p.scope === 'global' ? dim(' [global]') : '';
        console.log('');
        logger.info(`${bold(green(p.name))} ${dim(`v${p.version}`)} ${dim(`[${p.format}]`)}${scope}`);
        if (p.description) logger.info(`  ${p.description}`);

        if (p.components.skills.length > 0) {
          const agents = [...new Set(p.components.skills.map(s => s.agent))];
          logger.info(`  Skills: ${p.components.skills.length} → ${agents.join(', ')}`);
        }

        if (p.components.mcpServers.length > 0) {
          const agents = [...new Set(p.components.mcpServers.map(m => m.agent))];
          logger.info(`  MCP: ${p.components.mcpServers.length} → ${agents.join(', ')}`);
        }

        if (p.warnings.length > 0) {
          for (const w of p.warnings) {
            logger.warn(`  ${w}`);
          }
        }
      }
    });

  // --- plugins remove <name> (alias: rm) ---
  plugins
    .command('remove <name>')
    .alias('rm')
    .description('Remove an installed plugin')
    .option('-a, --agent <agents...>', 'Target specific agent(s)')
    .option('-g, --global', 'Remove from global scope')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (name: string, options) => {
      logger.title('🔌 AgentInit - Remove Plugin');

      const pluginManager = new PluginManager();
      const spinner = ora(`Removing plugin "${name}"...`).start();

      try {
        const result = await pluginManager.removePlugin(name, process.cwd(), {
          global: options.global,
          agents: options.agent,
          yes: options.yes,
        });

        if (!result.removed) {
          spinner.warn(result.details[0] || `Plugin "${name}" not found.`);
          for (const detail of result.details.slice(1)) {
            logger.info(`  ${detail}`);
          }
          return;
        }

        spinner.succeed(`Removed plugin ${green(bold(name))}`);
        for (const detail of result.details) {
          logger.info(`  ${detail}`);
        }
      } catch (error) {
        spinner.fail('Failed to remove plugin');
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
}

/**
 * Interactive agent selection grouped by shared skills directory
 */
async function interactiveAgentSelect(
  pluginManager: PluginManager,
  projectPath: string,
  global?: boolean
): Promise<string[] | undefined> {
  const groups = await pluginManager.groupAgentsBySkillsDir(projectPath, global);

  if (groups.length === 0) {
    logger.warn('No agents with skills support detected in this project.');
    return undefined;
  }

  // If only one group, auto-select
  if (groups.length === 1) {
    const group = groups[0]!;
    logger.info(`Installing to ${green(group.dir)} → ${group.agentNames.join(', ')}`);
    return group.agents.map(a => a.id);
  }

  // Use @inquirer/prompts for interactive selection
  try {
    const { checkbox } = await import('@inquirer/prompts');
    const choices = groups.map(group => ({
      name: `${group.dir.padEnd(16)} → ${group.agentNames.join(', ')}`,
      value: group.agents.map(a => a.id),
      checked: true,
    }));

    const selected = await checkbox({
      message: 'Select where to install:',
      choices,
    });

    // Flatten the array of arrays
    return (selected as string[][]).flat();
  } catch {
    // If inquirer not available, fall back to auto-detect
    return groups.flatMap(g => g.agents.map(a => a.id));
  }
}
