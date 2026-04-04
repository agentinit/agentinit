import { Command } from 'commander';
import ora from 'ora';
import prompts from 'prompts';
import { homedir } from 'os';
import { relative, resolve } from 'path';
import { green, dim } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { promptMultiselect, selectBundlePlugins } from '../utils/promptUtils.js';
import { SkillsManager } from '../core/skillsManager.js';
import { MultipleBundlePluginsError } from '../core/pluginManager.js';
import { getMarketplaceIds } from '../core/marketplaceRegistry.js';
import { AgentManager } from '../core/agentManager.js';
import type { Agent } from '../agents/Agent.js';
import {
  SHARED_SKILLS_TARGET_ID,
  SHARED_SKILLS_TARGET_NAME,
  type SkillInfo,
  type SkillsAddResult
} from '../types/skills.js';

interface SkillAgentGroup {
  dir: string;
  displayDir: string;
  agents: Agent[];
  agentNames: string[];
  compatibleAgents: Agent[];
  compatibleAgentNames: string[];
  description?: string;
  kind?: 'native' | 'canonical-shared';
}

interface SkillTargetSelection {
  agents?: string[];
  global?: boolean;
  aborted?: boolean;
}

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
    .option('--all', 'Select all bundled plugins when the source contains multiple plugins')
    .option('--copy', 'Copy skill files instead of symlinking')
    .option('-y, --yes', 'Skip prompts and auto-detect project-configured agents only')
    .action(async (source: string, options) => {
      logger.titleBox('AgentInit  Skills');

      const agentManager = new AgentManager();
      const skillsManager = new SkillsManager(agentManager);

      // If --list, discover and display skills from source, then return
      if (options.list) {
        const spinner = ora('Discovering skills...').start();
        try {
          const result = await skillsManager.discoverFromSource(source, process.cwd(), {
            from: options.from,
          });
          spinner.stop();
          displayDiscoveredSkills(result.skills, result.warnings);
        } catch (error) {
          if (error instanceof MultipleBundlePluginsError) {
            spinner.stop();
            const selected = await selectBundlePlugins(error.entries, 'list', { selectAll: options.all });
            if (!selected) {
              return;
            }
            for (const pluginName of selected) {
              const retrySpinner = ora(`Discovering skills from ${pluginName}...`).start();
              try {
                const result = await skillsManager.discoverFromSource(source, process.cwd(), {
                  from: options.from,
                  pluginName,
                });
                retrySpinner.stop();
                displayDiscoveredSkills(result.skills, result.warnings);
              } catch (retryError) {
                retrySpinner.fail(`Failed to discover skills from ${pluginName}`);
                logger.error(`Error: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
              }
            }
          } else {
            spinner.fail('Failed to discover skills');
            logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        return;
      }

      const verifySpinner = ora('Verifying skill source...').start();
      let selectedPluginNames: string[] | undefined;
      try {
        await skillsManager.prepareSource(source, process.cwd(), {
          from: options.from,
        });
        verifySpinner.stop();
      } catch (error) {
        if (error instanceof MultipleBundlePluginsError && (options.all || !options.yes)) {
          verifySpinner.stop();
          const selected = await selectBundlePlugins(error.entries, 'install', { selectAll: options.all });
          if (!selected) {
            return;
          }
          selectedPluginNames = selected;
          const retrySpinner = ora('Verifying skill source...').start();
          try {
            await skillsManager.prepareSource(source, process.cwd(), {
              from: options.from,
              ...(selectedPluginNames[0] ? { pluginName: selectedPluginNames[0] } : {}),
            });
            retrySpinner.stop();
          } catch (retryError) {
            retrySpinner.fail('Failed to verify skill source');
            logger.error(`Error: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            return;
          }
        } else {
          verifySpinner.fail('Failed to verify skill source');
          logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return;
        }
      }

      let targetAgents = options.agent as string[] | undefined;
      let targetGlobal = options.global as boolean | undefined;
      if (!targetAgents && !options.yes) {
        const selection = await resolveInteractiveSkillTargets(
          skillsManager,
          agentManager,
          source,
          process.cwd(),
          {
            from: options.from,
            global: options.global,
          },
        );

        if (selection?.aborted) {
          await skillsManager.discardPreparedSource(source, process.cwd(), {
            from: options.from,
          });
          return;
        }

        if (selection?.agents && selection.agents.length > 0) {
          targetAgents = selection.agents;
          targetGlobal = selection.global;
        }
      }

      // Install skills
      const buildInstallOptions = (pluginName?: string) => ({
        ...(options.from !== undefined ? { from: options.from } : {}),
        ...(targetGlobal !== undefined ? { global: targetGlobal } : {}),
        ...(targetAgents !== undefined ? { agents: targetAgents } : {}),
        ...(options.skill !== undefined ? { skills: options.skill } : {}),
        ...(options.copy !== undefined ? { copy: options.copy } : {}),
        ...(pluginName !== undefined ? { pluginName } : {}),
        ...(options.yes !== undefined ? { yes: options.yes } : {}),
      });

      const pluginsToInstall = selectedPluginNames || [undefined];
      for (const pluginName of pluginsToInstall) {
        const spinner = ora(pluginName ? `Installing skills from ${pluginName}...` : 'Installing skills...').start();
        try {
          if (pluginName && pluginName !== selectedPluginNames?.[0]) {
            await skillsManager.prepareSource(source, process.cwd(), {
              from: options.from,
              pluginName,
            });
          }
          const result = await skillsManager.addFromSource(source, process.cwd(), buildInstallOptions(pluginName));
          displayInstallResult(result, spinner, agentManager, skillsManager, source, { from: options.from });
        } catch (error) {
          spinner.fail(pluginName ? `Failed to install skills from ${pluginName}` : 'Failed to install skills');
          logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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
      logger.titleBox('AgentInit  Skills');

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
        existing.agents.add(formatSkillTargetName(agentManager, skill.agent));
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
      logger.titleBox('AgentInit  Skills');

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

async function resolveInteractiveSkillTargets(
  skillsManager: SkillsManager,
  agentManager: AgentManager,
  source: string,
  projectPath: string,
  options: { from?: string; global?: boolean },
): Promise<SkillTargetSelection | undefined> {
  let installGlobal = !!options.global;
  if (!options.global) {
    const response = await prompts({
      type: 'select',
      name: 'scope',
      message: 'Where should the skill be installed?',
      choices: [
        {
          title: 'This project',
          value: 'project',
          description: formatPromptPath(projectPath),
        },
        {
          title: 'Globally',
          value: 'global',
          description: getCanonicalGlobalSkillsDisplayPath(),
        },
      ],
      initial: 0,
    });

    if (!response.scope) {
      logger.info('Installation cancelled.');
      return { aborted: true };
    }

    installGlobal = response.scope === 'global';
  }

  const recommendedAgentId = getRecommendedAgentId(skillsManager, agentManager, source, options.from);
  const detectedGroups = installGlobal
    ? []
    : await getDetectedSkillGroups(agentManager, projectPath, false);
  let availableGroups = detectedGroups.length > 0
    ? detectedGroups
    : getSupportedSkillGroups(agentManager, projectPath, installGlobal);

  if (installGlobal) {
    availableGroups = prependCanonicalGlobalGroup(agentManager, projectPath, availableGroups);
  }

  if (availableGroups.length === 0) {
    logger.warn('No supported agents expose a skills directory.');
    return { aborted: true };
  }

  if (!installGlobal && detectedGroups.length === 0) {
    logger.warn('No project agent files with skills support were detected in this project.');
    logger.info('Select project agent directories manually. Run `agentinit init` if you want future installs to auto-detect.');
  }

  const response = await promptMultiselect<string[]>({
    name: 'groups',
    message: installGlobal
      ? 'Select which global agent skills directories to install into:'
      : detectedGroups.length > 0
        ? 'Select which project agent skills directories to install into:'
        : 'Select which project agent skills directories to install into manually:',
    min: 1,
    choices: availableGroups.map(group => ({
      title: formatSkillGroupTitle(group),
      ...(group.description ? { description: group.description } : {}),
      value: group.kind === 'canonical-shared'
        ? [SHARED_SKILLS_TARGET_ID]
        : group.agents.map(agent => agent.id),
      selected: shouldPreselectSkillGroup(
        group,
        installGlobal,
        detectedGroups.length > 0,
        recommendedAgentId,
      ),
    })),
  });

  const selected = flattenAgentIds(response.groups);
  if (selected.length === 0) {
    logger.info('No agents selected. Aborting.');
    return { aborted: true };
  }

  const selection: SkillTargetSelection = {
    agents: selected,
  };
  if (installGlobal) {
    selection.global = true;
  }

  return selection;
}

async function getDetectedSkillGroups(
  agentManager: AgentManager,
  projectPath: string,
  global?: boolean,
): Promise<SkillAgentGroup[]> {
  const detectedAgents = (await agentManager.detectAgents(projectPath)).map(entry => entry.agent);
  const groups = buildSkillGroups(detectedAgents, projectPath, global);
  const detectedIds = new Set(detectedAgents.map(agent => agent.id));
  const compatibleGroups = buildSkillGroups(
    agentManager.getAllAgents().filter(agent => !detectedIds.has(agent.id)),
    projectPath,
    global,
  );
  const compatibleByDir = new Map(compatibleGroups.map(group => [group.dir, group]));

  return groups.map(group => {
    const compatible = compatibleByDir.get(group.dir);
    return {
      ...group,
      compatibleAgents: compatible?.agents || [],
      compatibleAgentNames: compatible?.agentNames || [],
    };
  });
}

function getSupportedSkillGroups(
  agentManager: AgentManager,
  projectPath: string,
  global?: boolean,
): SkillAgentGroup[] {
  return buildSkillGroups(agentManager.getAllAgents(), projectPath, global);
}

function buildSkillGroups(
  agents: Agent[],
  projectPath: string,
  global?: boolean,
): SkillAgentGroup[] {
  const dirToAgents = new Map<string, Agent[]>();

  for (const agent of agents) {
    if (!agent.supportsSkills()) {
      continue;
    }

    const skillsDir = agent.getSkillsDir(projectPath, global);
    if (!skillsDir) {
      continue;
    }

    const existing = dirToAgents.get(skillsDir) || [];
    existing.push(agent);
    dirToAgents.set(skillsDir, existing);
  }

  return Array.from(dirToAgents.entries()).map(([dir, groupedAgents]) => {
    const canonicalShared = resolve(dir) === getCanonicalSkillsDirForScope(projectPath, !!global)
      && groupedAgents.every(agent => agent.getProjectSkillsStandard() === 'agents');

    return {
      dir,
      displayDir: formatSkillsDir(projectPath, dir),
      agents: groupedAgents,
      agentNames: groupedAgents.map(agent => agent.name),
      compatibleAgents: [],
      compatibleAgentNames: [],
      ...(canonicalShared
        ? {
          description: `Install only into the shared AGENTS.md store. Compatible tools: ${groupedAgents.map(agent => agent.name).join(', ')}.`,
          kind: 'canonical-shared' as const,
        }
        : {
          kind: 'native' as const,
        }),
    };
  });
}

function prependCanonicalGlobalGroup(
  agentManager: AgentManager,
  projectPath: string,
  groups: SkillAgentGroup[],
): SkillAgentGroup[] {
  const canonicalDir = getCanonicalGlobalSkillsDir();
  const sharedAgents = agentManager.getAllAgents().filter(agent =>
    agent.supportsSkills() &&
    agent.getProjectSkillsStandard() === 'agents' &&
    !!agent.getSkillsDir(projectPath, true),
  );

  if (sharedAgents.length === 0) {
    return groups;
  }

  const existingCanonicalIndex = groups.findIndex(group => resolve(group.dir) === canonicalDir);
  if (existingCanonicalIndex >= 0) {
    const existingCanonical = groups[existingCanonicalIndex]!;
    const remaining = groups.filter((_, index) => index !== existingCanonicalIndex);

    return [
      {
        ...existingCanonical,
        description: existingCanonical.description || `Install only into the shared AGENTS.md store. Compatible tools: ${existingCanonical.agentNames.join(', ')}.`,
        kind: 'canonical-shared',
      },
      ...remaining,
    ];
  }

  return [
    {
      dir: canonicalDir,
      displayDir: formatSkillsDir(projectPath, canonicalDir),
      agents: sharedAgents,
      agentNames: sharedAgents.map(agent => agent.name),
      compatibleAgents: [],
      compatibleAgentNames: [],
      description: `Install only into the shared AGENTS.md store. Compatible tools: ${sharedAgents.map(agent => agent.name).join(', ')}.`,
      kind: 'canonical-shared',
    },
    ...groups.map(group => {
      const description = group.description || describeGlobalSkillGroup(group);
      return {
        ...group,
        ...(description ? { description } : {}),
      };
    }),
  ];
}

function formatSkillsDir(projectPath: string, dir: string): string {
  const normalizedDir = dir.replace(/\\/g, '/').replace(/\/?$/, '/');
  const normalizedProjectPath = projectPath.replace(/\\/g, '/');
  const normalizedHome = homedir().replace(/\\/g, '/');

  if (normalizedDir.startsWith(`${normalizedProjectPath}/`)) {
    return `${relative(projectPath, dir).replace(/\\/g, '/').replace(/\/?$/, '/')}`;
  }

  if (normalizedDir.startsWith(`${normalizedHome}/`)) {
    return normalizedDir.replace(normalizedHome, '~');
  }

  return normalizedDir;
}

function formatPromptPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/').replace(/\/?$/, '/');
  const normalizedHome = homedir().replace(/\\/g, '/');

  if (normalizedPath === `${normalizedHome}/`) {
    return '~/';
  }

  if (normalizedPath.startsWith(`${normalizedHome}/`)) {
    return normalizedPath.replace(normalizedHome, '~');
  }

  return normalizedPath;
}

function getCanonicalGlobalSkillsDir(): string {
  return resolve(homedir(), '.agents/skills');
}

function getCanonicalSkillsDirForScope(projectPath: string, global: boolean): string {
  return global
    ? getCanonicalGlobalSkillsDir()
    : resolve(projectPath, '.agents/skills');
}

function getCanonicalGlobalSkillsDisplayPath(): string {
  return formatPromptPath(getCanonicalGlobalSkillsDir());
}

function describeGlobalSkillGroup(group: SkillAgentGroup): string | undefined {
  if (group.kind === 'canonical-shared') {
    return group.description || `Install only into the shared AGENTS.md store. Compatible tools: ${group.agentNames.join(', ')}.`;
  }

  if (group.agents.every(agent => agent.getProjectSkillsStandard() === 'agents')) {
    return `Native agent directory linked to ${getCanonicalGlobalSkillsDisplayPath()} when symlinks are used.`;
  }

  if (group.agents.every(agent => agent.getProjectSkillsStandard() === 'claude')) {
    return 'Native Claude-compatible skills directory.';
  }

  return undefined;
}

function formatSkillGroupTitle(group: SkillAgentGroup): string {
  if (group.kind === 'canonical-shared') {
    return `${group.displayDir} -> ${SHARED_SKILLS_TARGET_NAME}`;
  }

  return `${group.displayDir} -> ${group.agentNames.join(', ')}${formatCompatibleAgents(group)}`;
}

function formatSkillTargetName(agentManager: AgentManager, agentId: string): string {
  if (agentId === SHARED_SKILLS_TARGET_ID) {
    return SHARED_SKILLS_TARGET_NAME;
  }

  return agentManager.getAgentById(agentId)?.name || agentId;
}

function shouldPreselectSkillGroup(
  group: SkillAgentGroup,
  installGlobal: boolean,
  hasDetectedGroups: boolean,
  recommendedAgentId?: string,
): boolean {
  const includesRecommendedAgent = !!recommendedAgentId && group.agents.some(agent => agent.id === recommendedAgentId);

  if (!installGlobal) {
    return hasDetectedGroups || includesRecommendedAgent;
  }

  if (group.kind === 'canonical-shared') {
    return true;
  }

  if (!includesRecommendedAgent) {
    return false;
  }

  return true;
}

function formatCompatibleAgents(group: SkillAgentGroup): string {
  if (group.compatibleAgentNames.length === 0) {
    return '';
  }

  return dim(` (also compatible: ${group.compatibleAgentNames.join(', ')})`);
}

function flattenAgentIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const flattened = input.flatMap(value => Array.isArray(value) ? value : [value]);
  return Array.from(new Set(flattened.filter((value): value is string => typeof value === 'string')));
}

function getRecommendedAgentId(
  skillsManager: SkillsManager,
  agentManager: AgentManager,
  source: string,
  from?: string,
): string | undefined {
  try {
    const resolved = skillsManager.resolveSource(source, from ? { from } : undefined);
    if (resolved.type === 'marketplace' && resolved.marketplace && agentManager.getAgentById(resolved.marketplace)) {
      return resolved.marketplace;
    }
  } catch {}

  return undefined;
}

function logNoTargetAgentsGuidance(
  skillsManager: SkillsManager,
  agentManager: AgentManager,
  source: string,
  options: { from?: string },
): void {
  const recommendedAgentId = getRecommendedAgentId(skillsManager, agentManager, source, options.from) || 'claude';

  logger.info('No install target was resolved automatically.');
  logger.info('Try one of the following:');
  logger.info(`  ${buildSkillsAddCommand(source, options.from, ['--agent', recommendedAgentId])}`);
  logger.info(`  ${buildSkillsAddCommand(source, options.from, ['--global', '--agent', recommendedAgentId])}`);
  logger.info('  agentinit init');
}

function buildSkillsAddCommand(source: string, from: string | undefined, extraArgs: string[]): string {
  const args = ['agentinit', 'skills', 'add', source];
  if (from) {
    args.push('--from', from);
  }

  args.push(...extraArgs);
  return args.join(' ');
}

function displayDiscoveredSkills(skills: SkillInfo[], warnings: string[]): void {
  if (skills.length === 0) {
    logger.info('No skills found in the source.');
    for (const warning of warnings) {
      logger.warn(warning);
    }
    return;
  }

  logger.info(`Found ${green(String(skills.length))} skill(s):\n`);
  logger.info('  Name                Description');
  logger.info('  ──────────────────  ──────────────────────────────────');
  for (const skill of skills) {
    const name = skill.name.padEnd(18);
    logger.info(`  ${green(name)}  ${skill.description}`);
  }

  if (warnings.length > 0) {
    logger.info('');
    for (const warning of warnings) {
      logger.warn(warning);
    }
  }
}

function displayInstallResult(
  result: SkillsAddResult,
  spinner: ReturnType<typeof ora>,
  agentManager: AgentManager,
  skillsManager: SkillsManager,
  source: string,
  options: { from?: string },
): void {
  if (result.installed.length === 0 && result.skipped.length === 0) {
    spinner.warn('No skills found in the source.');
    for (const warning of result.warnings) {
      logger.warn(warning);
    }
    return;
  }

  if (result.installed.length === 0 && result.skipped.length > 0 && result.skipped.every(skip => skip.reason === 'No target agents found')) {
    spinner.warn('No target agents found.');
    logNoTargetAgentsGuidance(skillsManager, agentManager, source, {
      ...(options.from !== undefined ? { from: options.from } : {}),
    });

    if (result.warnings.length > 0) {
      logger.info('');
      for (const warning of result.warnings) {
        logger.warn(warning);
      }
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
    existing.agents.add(formatSkillTargetName(agentManager, item.agent));
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
}
