import { Command } from 'commander';
import ora from 'ora';
import prompts from 'prompts';
import { dirname, relative } from 'path';
import { green, dim, bold, cyan, yellow, orange } from '../utils/colors.js';
import { logger } from '../utils/logger.js';
import { PluginManager } from '../core/pluginManager.js';
import { AgentManager } from '../core/agentManager.js';
import { getConfiguredDefaultMarketplaceId, getMarketplaceCategories } from '../core/marketplaceRegistry.js';
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
  const marketplaceCategoryHelp = getMarketplaceCategories().join(', ');

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
    .option('-y, --yes', 'Skip confirmation prompts, auto-detect project-configured agents')
    .action(async (source: string, options) => {
      logger.titleBox('AgentInit  Plugins');

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
    .option('--category <category>', `Filter by marketplace category (examples: ${marketplaceCategoryHelp})`)
    .action(async (query: string | undefined, options) => {
      logger.titleBox('AgentInit  Plugin Search');

      const pluginManager = new PluginManager();
      const registryId = options.from || getConfiguredDefaultMarketplaceId();
      if (!registryId) {
        logger.info(`Please specify a marketplace with --from <marketplace>. Available: ${marketplaceHelp}`);
        logger.info('Examples:');
        logger.info('  agentinit plugins search --from claude');
        logger.info('  agentinit plugins search code-review --from claude');
        return;
      }

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
      logger.titleBox('AgentInit  Installed Plugins');

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
      logger.titleBox('AgentInit  Remove Plugin');

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

type SourceWarningItem = {
  type: 'marketplace-miss' | 'fallback-verified' | 'fallback-unverified' | 'bundle-detected' | 'bundle-using';
  text: string;
};

function getSourceWarnings(warnings: string[]): SourceWarningItem[] {
  const items: SourceWarningItem[] = [];

  for (const warning of warnings) {
    const missingMatch = warning.match(/^Plugin "(.+)" not found in (.+) marketplace\.$/);
    if (missingMatch) {
      items.push({
        type: 'marketplace-miss',
        text: `${missingMatch[2]} marketplace does not contain "${missingMatch[1]}".`,
      });
      continue;
    }

    const fallbackMatch = warning.match(/^Marketplace lookup failed; trying (verified|unverified) GitHub repository (.+) instead\.$/);
    if (fallbackMatch) {
      items.push({
        type: fallbackMatch[1] === 'verified' ? 'fallback-verified' : 'fallback-unverified',
        text: `${fallbackMatch[1] === 'verified' ? 'Verified' : 'Unverified'} GitHub repository: ${fallbackMatch[2]}`,
      });
      continue;
    }

    const bundleMatch = warning.match(/^Source "(.+)" is a Claude Code marketplace bundle; using bundled plugin "(.+)"\.$/);
    if (bundleMatch) {
      items.push({
        type: 'bundle-detected',
        text: `Claude Code marketplace bundle detected: ${bundleMatch[1]}`,
      });
      items.push({
        type: 'bundle-using',
        text: `Using bundled plugin "${bundleMatch[2]}".`,
      });
    }
  }

  return items;
}

function getRemainingWarnings(warnings: string[]): string[] {
  return warnings.filter(warning =>
    !/^Plugin "(.+)" not found in (.+) marketplace\.$/.test(warning)
    && !/^Marketplace lookup failed; trying (verified|unverified) GitHub repository (.+) instead\.$/.test(warning)
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
    logger.section('Source');
    const lastIdx = sourceWarnings.length - 1;
    for (let i = 0; i < sourceWarnings.length; i++) {
      const item = sourceWarnings[i]!;
      const isLast = i === lastIdx;
      if (item.type === 'marketplace-miss') {
        logger.tree(yellow('⚠') + `  ${item.text}`, isLast);
      } else if (item.type === 'fallback-verified') {
        logger.tree(green('✓') + `  ${item.text}`, isLast);
      } else if (item.type === 'fallback-unverified') {
        logger.tree(yellow('⚠') + `  ${item.text}`, isLast);
      } else if (item.type === 'bundle-detected') {
        logger.tree(orange('✓') + `  ${orange(item.text)}`, isLast);
      } else if (item.type === 'bundle-using') {
        logger.tree(green('✓') + `  ${item.text}`, isLast);
      }
    }
  }

  const nativeWarning = getNativeCompatibilityWarning(previewOrResult);
  if (nativeWarning) {
    logger.section('Compatibility');
    const lines: { text: string; isLast: boolean }[] = [];
    lines.push({
      text: orange('⚠') + `  ${orange('Claude Code')}-only components detected: ${dim(nativeWarning.features.join(', '))}`,
      isLast: false,
    });
    if (nativeWarning.installPath) {
      lines.push({
        text: orange('ℹ') + `  ${orange('Claude')} native install path: ${dim(formatPathForDisplay(nativeWarning.installPath, projectPath))}`,
        isLast: false,
      });
    }
    if (nativeWarning.skipped) {
      lines.push({
        text: orange('⚠') + `  No ${orange('Claude Code')} target selected. Native installation was skipped.`,
        isLast: true,
      });
    } else {
      lines.push({
        text: cyan('ℹ') + '  Non-Claude targets install only the portable skills and MCP servers.',
        isLast: false,
      });
      const reloadMsg = 'nativePreview' in previewOrResult
        ? `  If you install to ${orange('Claude Code')}, reload plugins with ${bold('/reload-plugins')} afterward.`
        : `  Reload plugins in ${orange('Claude Code')} with ${bold('/reload-plugins')} after install.`;
      lines.push({
        text: orange('ℹ') + reloadMsg,
        isLast: true,
      });
    }
    // Fix last marker
    if (lines.length > 0) {
      lines[lines.length - 1]!.isLast = true;
    }
    for (const line of lines) {
      logger.tree(line.text, line.isLast);
    }
  }

  const otherWarnings = getRemainingWarnings(allWarnings);
  if (otherWarnings.length > 0) {
    logger.section('Warnings');
    const lastIdx = otherWarnings.length - 1;
    for (let i = 0; i < otherWarnings.length; i++) {
      logger.tree(yellow('⚠') + `  ${otherWarnings[i]}`, i === lastIdx);
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
    logger.section('Skills');
    const entries = [...skillGroups.entries()];
    const copiedFallbacks = result.skills.installed.filter(item => item.symlinkFailed);
    const totalItems = entries.length + (copiedFallbacks.length > 0 ? 1 : 0);
    let idx = 0;
    for (const [targetDir, data] of entries) {
      idx++;
      const agentLabel = colorAgentLabel([...data.agents], agentManager);
      logger.tree(
        `${agentLabel}: ${green(String(data.skillNames.size))} skill(s) -> ${dim(formatPathForDisplay(targetDir, projectPath))}`,
        idx === totalItems,
      );
    }
    if (copiedFallbacks.length > 0) {
      logger.tree(yellow('⚠') + `  Symlink creation failed for ${copiedFallbacks.length} skill install(s); copied the files instead.`, true);
    }
  }

  if (result.mcpServers.applied.length > 0) {
    logger.section('MCP Servers');
    const byAgent = new Map<string, string[]>();
    for (const item of result.mcpServers.applied) {
      const list = byAgent.get(item.agent) || [];
      list.push(item.name);
      byAgent.set(item.agent, list);
    }
    const entries = [...byAgent.entries()];
    for (let i = 0; i < entries.length; i++) {
      const [agent, servers] = entries[i]!;
      const agentName = agentManager.getAgentById(agent)?.name || agent;
      const coloredName = isClaudeAgent(agent) ? orange(agentName) : agentName;
      logger.tree(
        `${coloredName}: ${cyan(String(servers.length))} server(s) [${servers.join(', ')}]`,
        i === entries.length - 1,
      );
    }
  }

  if (result.nativePlugins.installed.length > 0) {
    logger.section('Native Install');
    for (let i = 0; i < result.nativePlugins.installed.length; i++) {
      const nativePlugin = result.nativePlugins.installed[i]!;
      const agentName = agentManager.getAgentById(nativePlugin.agent)?.name || nativePlugin.agent;
      const coloredName = isClaudeAgent(nativePlugin.agent) ? orange(agentName) : agentName;
      logger.tree(
        `${coloredName}: ${dim(formatPathForDisplay(nativePlugin.installPath, projectPath))}`,
        i === result.nativePlugins.installed.length - 1,
      );
    }
  }
}

function isClaudeAgent(agentId: string): boolean {
  return agentId === 'claude' || agentId.startsWith('claude-');
}

function colorAgentLabel(agentIds: string[], agentManager: AgentManager): string {
  return agentIds
    .map(agentId => {
      const name = agentManager.getAgentById(agentId)?.name || agentId;
      return isClaudeAgent(agentId) ? orange(name) : name;
    })
    .join(', ');
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

function getPluginGroupDescription(
  group: PluginAgentGroup,
  preview: PluginInspectionResult,
  projectPath: string,
): string {
  const portableSummary = getPortableComponentSummary(preview);
  if (!preview.nativePreview) {
    return portableSummary;
  }

  const containsClaudeCode = group.agents.some(agent => agent.id === 'claude');
  if (!containsClaudeCode) {
    return `${portableSummary}. Skills will be installed here, but Claude-specific components will not be fully available for these agents.`;
  }

  const otherAgents = group.agents
    .filter(agent => agent.id !== 'claude')
    .map(agent => agent.name);
  const installPath = formatPathForDisplay(preview.nativePreview.installPath, projectPath);

  if (otherAgents.length === 0) {
    return `${portableSummary}. Full plugin support is available in Claude Code; the native plugin installs at ${installPath}.`;
  }

  const otherAgentsLabel = otherAgents.join(', ');
  const shareVerb = otherAgents.length === 1 ? 'shares' : 'share';
  const receiveVerb = otherAgents.length === 1 ? 'receives' : 'receive';
  return `${portableSummary}. Full plugin support is available in Claude Code; the native plugin installs at ${installPath}. ${otherAgentsLabel} ${shareVerb} this skills directory but only ${receiveVerb} the installed skills.`;
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
      ? 'Select which global agents should receive this plugin:'
      : 'Select which agents should receive this plugin:',
    instructions: false,
    min: 1,
    choices: groups.map(group => {
      const compatible = group.compatibleAgentNames.length > 0
        ? dim(` (also compatible: ${group.compatibleAgentNames.join(', ')})`)
        : '';

      return {
        title: `${group.displayDir} -> ${getAgentLabel(group.agents.map(agent => agent.id), agentManager)}${compatible}`,
        description: getPluginGroupDescription(group, preview, projectPath),
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
