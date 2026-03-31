import { Command } from 'commander';
import ora from 'ora';
import prompts from 'prompts';
import { dirname, relative } from 'path';
import { green, dim, bold, cyan } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { PluginManager } from '../core/pluginManager.js';
import { AgentManager } from '../core/agentManager.js';
import type { Agent } from '../agents/Agent.js';
import type { PluginInspectionResult, PluginInstallResult } from '../types/plugins.js';

type PluginAgentGroup = {
  dir: string;
  displayDir: string;
  agents: Agent[];
  agentNames: string[];
  compatibleAgentNames: string[];
};

type PluginTargetSelection = {
  agents?: string[];
  global?: boolean;
  aborted?: boolean;
};

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
    .option('--copy-skills', 'Copy plugin skills instead of using canonical symlink installs')
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
          const preview = await pluginManager.inspectPlugin(source, {
            from: options.from,
          });

          spinner.stop();
          const p = preview.plugin;

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

          if (p.skills.length === 0 && p.mcpServers.length === 0) {
            logger.info('  No portable components found (no skills or MCP servers).');
          }

          renderPluginWarnings(preview, process.cwd());
        } catch (error) {
          spinner.fail('Failed to fetch plugin');
          logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return;
      }

      // Interactive agent selection if not --yes and not --agent
      let agentIds = options.agent as string[] | undefined;
      let targetGlobal = options.global as boolean | undefined;
      let preview: PluginInspectionResult | null = null;
      let previewRendered = false;
      if (!agentIds && !options.yes) {
        const previewSpinner = ora('Inspecting plugin...').start();
        try {
          preview = await pluginManager.preparePluginInstall(source, {
            from: options.from,
          });
          previewSpinner.stop();
          renderPluginWarnings(preview, process.cwd());
          previewRendered = true;
        } catch (error) {
          previewSpinner.fail('Failed to inspect plugin');
          logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return;
        }

        try {
          const selection = await interactiveAgentSelect(
            pluginManager,
            agentManager,
            process.cwd(),
            targetGlobal,
            preview,
          );
          if (!selection || selection.aborted || !selection.agents || selection.agents.length === 0) {
            await pluginManager.discardPreparedPlugin(source, { from: options.from });
            logger.info('No agents selected. Aborting.');
            return;
          }
          agentIds = selection.agents;
          targetGlobal = selection.global ?? targetGlobal;
        } catch (error) {
          // Fallback to auto-detect if interactive fails (e.g., no TTY)
          logger.info('Interactive prompt unavailable. Auto-detecting agents...');
          if (error instanceof Error && error.message) {
            logger.debug(error.message);
          }
        }
      }

      // Install
      const spinner = ora('Installing plugin...').start();
      try {
        const result = await pluginManager.installPlugin(source, process.cwd(), {
          from: options.from,
          agents: agentIds,
          global: targetGlobal,
          copySkills: options.copySkills,
          yes: options.yes,
        });

        const p = result.plugin;
        const totalSkills = result.skills.installed.length;
        const totalMcp = result.mcpServers.applied.length;
        const totalNative = result.nativePlugins.installed.length;

        if (totalSkills === 0 && totalMcp === 0 && totalNative === 0) {
          spinner.warn(`Plugin "${p.name}" has no portable components to install.`);
          if (!previewRendered) {
            renderPluginWarnings(result, process.cwd());
          }
          return;
        }

        spinner.succeed(`Installed plugin ${green(bold(p.name))} ${dim(`v${p.version}`)}`);
        renderInstalledComponents(result, agentManager, process.cwd());

        // Skipped
        if (result.skills.skipped.length > 0 || result.mcpServers.skipped.length > 0 || result.nativePlugins.skipped.length > 0) {
          console.log('');
          for (const s of result.skills.skipped) {
            logger.debug(`Skipped skill ${s.name}: ${s.reason}`);
          }
          for (const s of result.mcpServers.skipped) {
            logger.debug(`Skipped MCP ${s.name}: ${s.reason}`);
          }
          for (const s of result.nativePlugins.skipped) {
            logger.warn(`Skipped native plugin payload for ${s.agent}: ${s.reason}`);
          }
        }

        if (!previewRendered) {
          renderPluginWarnings(result, process.cwd());
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

        if ((p.components.nativePlugins || []).length > 0) {
          const agents = [...new Set((p.components.nativePlugins || []).map(nativePlugin => nativePlugin.agent))];
          logger.info(`  Native Plugins: ${(p.components.nativePlugins || []).length} → ${agents.join(', ')}`);
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

function formatPathForDisplay(pathValue: string, projectPath: string): string {
  if (pathValue.startsWith(`${projectPath}/`)) {
    return relative(projectPath, pathValue) || '.';
  }
  const homePrefix = `${process.env.HOME || ''}/`;
  if (homePrefix !== '/' && pathValue.startsWith(homePrefix)) {
    return `~/${pathValue.slice(homePrefix.length)}`;
  }
  return pathValue;
}

function getAgentLabel(agentIds: string[], agentManager: AgentManager): string {
  return agentIds
    .map(agentId => agentManager.getAgentById(agentId)?.name || agentId)
    .join(', ');
}

function getPortableComponentSummary(preview: PluginInspectionResult): string {
  const parts: string[] = [];
  if (preview.plugin.skills.length > 0) {
    parts.push(`${preview.plugin.skills.length} skill(s)`);
  }
  if (preview.plugin.mcpServers.length > 0) {
    parts.push(`${preview.plugin.mcpServers.length} MCP server(s)`);
  }
  return parts.length > 0 ? parts.join(', ') : 'No portable components';
}

function getSourceWarnings(warnings: string[]): string[] {
  const lines: string[] = [];

  for (const warning of warnings) {
    const missingMatch = warning.match(/^Plugin "(.+)" not found in (.+) marketplace\.$/);
    if (missingMatch) {
      lines.push(`${missingMatch[2]} marketplace does not contain "${missingMatch[1]}".`);
      continue;
    }

    const fallbackMatch = warning.match(/^Marketplace lookup failed; trying unverified GitHub repository (.+) instead\.$/);
    if (fallbackMatch) {
      lines.push(`Falling back to unverified GitHub repository: ${fallbackMatch[1]}`);
      continue;
    }

    const bundleMatch = warning.match(/^Source "(.+)" is a Claude Code marketplace bundle; using bundled plugin "(.+)"\.$/);
    if (bundleMatch) {
      lines.push(`Claude Code marketplace bundle detected: ${bundleMatch[1]}`);
      lines.push(`Using bundled plugin "${bundleMatch[2]}".`);
    }
  }

  return lines;
}

function getRemainingWarnings(warnings: string[]): string[] {
  return warnings.filter(warning =>
    !/^Plugin "(.+)" not found in (.+) marketplace\.$/.test(warning)
    && !/^Marketplace lookup failed; trying unverified GitHub repository (.+) instead\.$/.test(warning)
    && !/^Source "(.+)" is a Claude Code marketplace bundle; using bundled plugin "(.+)"\.$/.test(warning)
    && !/^Hooks \(hooks\/\) are Claude Code-specific$/.test(warning)
    && !/^Agent definitions \(agents\/\) are Claude Code-specific$/.test(warning)
    && !/^Claude Code-native plugin components detected \((.+)\);/.test(warning)
    && !/^Claude Code-native plugin components detected \((.+)\), but no Claude Code target was selected; skipped native install\.$/.test(warning)
    && warning !== 'Reload plugins in Claude Code with /reload-plugins to activate native plugin components.'
  );
}

function getNativeCompatibilityWarning(
  previewOrResult: PluginInspectionResult | PluginInstallResult,
): { features: string[]; installPath?: string; skipped: boolean } | null {
  if ('nativePreview' in previewOrResult) {
    if (!previewOrResult.nativePreview) {
      return null;
    }

    return {
      features: previewOrResult.nativePreview.features,
      installPath: previewOrResult.nativePreview.installPath,
      skipped: false,
    };
  }

  const warnings = previewOrResult.warnings;
  const skippedMatch = warnings
    .map((warning: string) => warning.match(/^Claude Code-native plugin components detected \((.+)\), but no Claude Code target was selected; skipped native install\.$/))
    .find(Boolean);
  if (skippedMatch) {
    return {
      features: skippedMatch[1]!.split(',').map((value: string) => value.trim()).filter(Boolean),
      skipped: true,
    };
  }

  const installedMatch = warnings
    .map((warning: string) => warning.match(/^Claude Code-native plugin components detected \((.+)\); they will only work in Claude Code and install into ~\/\.claude\/plugins\.$/))
    .find(Boolean);
  if (installedMatch) {
    const installPath = previewOrResult.nativePlugins.installed[0]?.installPath;
    return {
      features: installedMatch[1]!.split(',').map((value: string) => value.trim()).filter(Boolean),
      skipped: false,
      ...(installPath ? { installPath } : {}),
    };
  }

  return null;
}

function renderPluginWarnings(
  previewOrResult: PluginInspectionResult | PluginInstallResult,
  projectPath: string,
): void {
  const allWarnings = 'nativePreview' in previewOrResult
    ? previewOrResult.plugin.warnings
    : previewOrResult.warnings;
  const sourceWarnings = getSourceWarnings(previewOrResult.plugin.warnings);
  if (sourceWarnings.length > 0) {
    console.log('');
    logger.subtitle('Source');
    for (const warning of sourceWarnings) {
      logger.warn(`  ${warning}`);
    }
  }

  const nativeWarning = getNativeCompatibilityWarning(previewOrResult);
  if (nativeWarning) {
    console.log('');
    logger.subtitle('Compatibility');
    logger.warn(`  Claude Code-only components detected: ${nativeWarning.features.join(', ')}`);
    if (nativeWarning.installPath) {
      logger.info(`  Claude native install path: ${formatPathForDisplay(nativeWarning.installPath, projectPath)}`);
    }
    if (nativeWarning.skipped) {
      logger.warn('  No Claude Code target selected. Native Claude installation was skipped.');
    } else {
      logger.info('  Non-Claude targets install only the portable skills and MCP servers.');
      logger.info(
        'nativePreview' in previewOrResult
          ? '  If you install to Claude Code, reload plugins with /reload-plugins afterward.'
          : '  Reload plugins in Claude Code with /reload-plugins after install.'
      );
    }
  }

  const otherWarnings = getRemainingWarnings(allWarnings);
  if (otherWarnings.length > 0) {
    console.log('');
    logger.subtitle('Warnings');
    for (const warning of otherWarnings) {
      logger.warn(`  ${warning}`);
    }
  }
}

function renderInstalledComponents(
  result: PluginInstallResult,
  agentManager: AgentManager,
  projectPath: string,
): void {
  const skillGroups = new Map<string, { agents: Set<string>; skillNames: Set<string> }>();
  for (const item of result.skills.installed) {
    const targetDir = dirname(item.path);
    const existing = skillGroups.get(targetDir) || { agents: new Set<string>(), skillNames: new Set<string>() };
    existing.agents.add(item.agent);
    existing.skillNames.add(item.name);
    skillGroups.set(targetDir, existing);
  }

  if (skillGroups.size > 0) {
    logger.subtitle('Skills');
    for (const [targetDir, data] of skillGroups) {
      logger.info(
        `  ${getAgentLabel([...data.agents], agentManager)}: ${green(String(data.skillNames.size))} skill(s) -> ${formatPathForDisplay(targetDir, projectPath)}`
      );
    }

    const copiedFallbacks = result.skills.installed.filter(item => item.symlinkFailed);
    if (copiedFallbacks.length > 0) {
      logger.warn(`  Symlink creation failed for ${copiedFallbacks.length} skill install(s); copied the files instead.`);
    }
  }

  if (result.mcpServers.applied.length > 0) {
    logger.subtitle('MCP');
    const byAgent = new Map<string, string[]>();
    for (const item of result.mcpServers.applied) {
      const list = byAgent.get(item.agent) || [];
      list.push(item.name);
      byAgent.set(item.agent, list);
    }
    for (const [agent, servers] of byAgent) {
      logger.info(`  ${agentManager.getAgentById(agent)?.name || agent}: ${cyan(String(servers.length))} server(s) [${servers.join(', ')}]`);
    }
  }

  if (result.nativePlugins.installed.length > 0) {
    logger.subtitle('Native');
    for (const nativePlugin of result.nativePlugins.installed) {
      logger.info(
        `  ${agentManager.getAgentById(nativePlugin.agent)?.name || nativePlugin.agent}: ${formatPathForDisplay(nativePlugin.installPath, projectPath)}`
      );
    }
  }
}

function buildGlobalPluginGroups(
  agentManager: AgentManager,
  projectPath: string,
): PluginAgentGroup[] {
  const dirToAgents = new Map<string, Agent[]>();

  for (const agent of agentManager.getAllAgents()) {
    if (!agent.supportsSkills()) {
      continue;
    }

    const skillsDir = agent.getSkillsDir(projectPath, true);
    if (!skillsDir) {
      continue;
    }

    const existing = dirToAgents.get(skillsDir) || [];
    existing.push(agent);
    dirToAgents.set(skillsDir, existing);
  }

  return Array.from(dirToAgents.entries()).map(([dir, agents]) => ({
    dir,
    displayDir: formatPathForDisplay(dir, projectPath),
    agents,
    agentNames: agents.map(agent => agent.name),
    compatibleAgentNames: [],
  }));
}

/**
 * Interactive agent selection grouped by shared skills directory
 */
async function interactiveAgentSelect(
  pluginManager: PluginManager,
  agentManager: AgentManager,
  projectPath: string,
  global: boolean | undefined,
  preview: PluginInspectionResult,
): Promise<PluginTargetSelection | undefined> {
  let installGlobal = !!global;
  let groups: PluginAgentGroup[] = installGlobal
    ? buildGlobalPluginGroups(agentManager, projectPath)
    : (await pluginManager.groupAgentsBySkillsDir(projectPath, false)).map(group => ({
      ...group,
      displayDir: group.dir,
    }));

  if (groups.length === 0 && !installGlobal) {
    logger.warn('No agents with skills support detected in this project.');
    const scopeResponse = await prompts({
      type: 'select',
      name: 'scope',
      message: 'Install this plugin globally instead?',
      choices: [
        {
          title: 'Globally',
          value: 'global',
        },
        {
          title: 'Cancel',
          value: 'cancel',
        },
      ],
      initial: 0,
    });

    if (scopeResponse.scope !== 'global') {
      return { aborted: true };
    }

    installGlobal = true;
    groups = buildGlobalPluginGroups(agentManager, projectPath);
  }

  if (groups.length === 0) {
    logger.warn('No supported agents expose a skills directory.');
    return { aborted: true };
  }

  const response = await prompts({
    type: 'multiselect',
    name: 'groups',
    message: installGlobal
      ? 'Select target global agent skills directories:'
      : 'Select target agent skills directories:',
    instructions: false,
    min: 1,
    choices: groups.map(group => {
      const containsClaude = group.agents.some(agent => agent.id === 'claude');
      const compatible = group.compatibleAgentNames.length > 0
        ? dim(` (also compatible: ${group.compatibleAgentNames.join(', ')})`)
        : '';
      const description = preview.nativePreview
        ? containsClaude
          ? `${getPortableComponentSummary(preview)}. Also installs the Claude native plugin at ${formatPathForDisplay(preview.nativePreview.installPath, projectPath)}.`
          : `${getPortableComponentSummary(preview)} only. Claude-only components remain unavailable for these agents.`
        : getPortableComponentSummary(preview);

      return {
        title: `${group.displayDir} -> ${getAgentLabel(group.agents.map(agent => agent.id), agentManager)}${compatible}`,
        description,
        value: group.agents.map(agent => agent.id),
        selected: true,
      };
    }),
  });

  const selected = Array.isArray(response.groups)
    ? [...new Set((response.groups as string[][]).flat())]
    : [];
  return selected.length > 0
    ? {
      agents: selected,
      ...(installGlobal ? { global: true } : {}),
    }
    : undefined;
}
