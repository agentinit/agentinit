import { Command } from 'commander';
import ora from 'ora';
import prompts from 'prompts';
import { homedir } from 'os';
import { relative, resolve } from 'path';
import { green, yellow, red, dim, cyan } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { promptMultiselect, selectBundlePlugins } from '../utils/promptUtils.js';
import { SkillsManager } from '../core/skillsManager.js';
import { MultipleBundlePluginsError } from '../core/pluginManager.js';
import { getMarketplaceIds } from '../core/marketplaceRegistry.js';
import { AgentManager } from '../core/agentManager.js';
import { InstallLock, getLockEntryTargetLabel } from '../core/installLock.js';
import { fileExists } from '../utils/fs.js';
import { lockSourceToSpecifier, type LockSourceSpecifier } from '../utils/lockSource.js';
import type { Agent } from '../agents/Agent.js';
import type { LockEntry, LockSource } from '../types/lockfile.js';
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

interface InteractiveSkillSelection {
  skills?: string[];
  prefix?: string;
  aborted?: boolean;
}

function normalizeSkillPrefix(prefix?: string): string {
  return prefix?.trim() ?? '';
}

function matchesSelectedSkillName(skillName: string, selectedNames: Set<string>, prefix?: string): boolean {
  if (selectedNames.has(skillName.toLowerCase())) {
    return true;
  }

  const normalizedPrefix = normalizeSkillPrefix(prefix);
  if (!normalizedPrefix) {
    return false;
  }

  return selectedNames.has(`${normalizedPrefix}${skillName}`.toLowerCase());
}

export function registerSkillsCommand(program: Command): void {
  const marketplaceHelp = getMarketplaceIds().join(', ');
  const skills = program
    .command('skills')
    .description('Manage agent skills');

  // --- skills add <source> ---
  skills
    .command('add <source>')
    .description('Add skills from a marketplace, hosted Git repo, or local path')
    .option('--from <marketplace>', `Marketplace source override (available: ${marketplaceHelp})`)
    .option('-g, --global', 'Install skills globally')
    .option('-a, --agent <agents...>', 'Target specific agent(s)')
    .option('-s, --skill <names...>', 'Install only specific skills by name')
    .option('-l, --list', 'List available skills from the source without installing')
    .option('--all', 'Select all bundled plugins when the source contains multiple plugins')
    .option('--copy', 'Copy skill files instead of symlinking')
    .option('--prefix <prefix>', 'Prefix installed skill names')
    .option('--no-scan', 'Skip security scanning before installation')
    .option('--allow-risky', 'Install even if scanning finds high-risk patterns')
    .option('-y, --yes', 'Skip prompts, auto-detect project-configured agents, and apply available skill updates')
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
      let preparedSkills: SkillInfo[] = [];
      try {
        const prepared = await skillsManager.prepareSource(source, process.cwd(), {
          from: options.from,
        });
        preparedSkills = prepared.skills;
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
            const prepared = await skillsManager.prepareSource(source, process.cwd(), {
              from: options.from,
              ...(selectedPluginNames[0] ? { pluginName: selectedPluginNames[0] } : {}),
            });
            preparedSkills = prepared.skills;
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
      let selectedSkillNames = options.skill as string[] | undefined;
      let installPrefix = options.prefix as string | undefined;

      if (!options.yes && (!selectedSkillNames || selectedSkillNames.length === 0) && preparedSkills.length > 1) {
        if (selectedPluginNames && selectedPluginNames.length > 1) {
          logger.info('Multiple bundled plugins selected; installing all skills from each selected plugin. Use --skill to filter by skill name.');
        } else {
          const skillSelection = await resolveInteractiveSkillSelection(preparedSkills, installPrefix);
          if (skillSelection.aborted) {
            await skillsManager.discardPreparedSource(source, process.cwd(), {
              from: options.from,
            });
            return;
          }

          selectedSkillNames = skillSelection.skills;
          installPrefix = skillSelection.prefix;
        }
      }

      if (!targetAgents && !options.yes) {
        const selectedSkillNameSet = selectedSkillNames && selectedSkillNames.length > 0
          ? new Set(selectedSkillNames.map((name: string) => name.toLowerCase()))
          : undefined;
        const filteredPreviewSkills = selectedSkillNameSet
          ? preparedSkills.filter(skill => matchesSelectedSkillName(skill.name, selectedSkillNameSet, installPrefix))
          : preparedSkills;
        const selection = await resolveInteractiveSkillTargets(
          skillsManager,
          agentManager,
          source,
          process.cwd(),
          {
            from: options.from,
            global: options.global,
            copy: options.copy,
            skills: filteredPreviewSkills,
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
      const confirmUpdate = options.yes
        ? undefined
        : async (skills: SkillInfo[]) => {
            const names = skills.map(s => s.name).join(', ');
            const response = await prompts({
              type: 'confirm',
              name: 'update',
              message: skills.length === 1
                ? `Skill "${skills[0]!.name}" has been updated. Update it?`
                : `${skills.length} skill(s) have updates (${names}). Update them?`,
              initial: true,
            });
            return response.update ? skills : [];
          };

      const buildInstallOptions = (pluginName?: string) => ({
        ...(options.from !== undefined ? { from: options.from } : {}),
        ...(targetGlobal !== undefined ? { global: targetGlobal } : {}),
        ...(targetAgents !== undefined ? { agents: targetAgents } : {}),
        ...(selectedSkillNames !== undefined ? { skills: selectedSkillNames } : {}),
        ...(installPrefix !== undefined ? { prefix: installPrefix } : {}),
        ...(options.copy !== undefined ? { copy: options.copy } : {}),
        ...(options.scan !== undefined ? { scan: options.scan } : {}),
        ...(options.allowRisky !== undefined ? { allowRisky: options.allowRisky } : {}),
        ...(pluginName !== undefined ? { pluginName } : {}),
        ...(options.yes !== undefined ? { yes: options.yes } : {}),
        ...(confirmUpdate !== undefined ? { confirmUpdate } : {}),
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

  // --- skills update [name] ---
  skills
    .command('update [name]')
    .description('Update installed skills from their original source')
    .option('--everywhere', 'Update across all tracked projects (uses global lockfile)')
    .option('-d, --dry-run', 'Show what would be updated without making changes')
    .action(async (name: string | undefined, options) => {
      logger.titleBox('AgentInit  Skills');

      const installLock = new InstallLock();

      if (options.everywhere) {
        if (!name) {
          logger.error('Skill name is required with --everywhere.');
          logger.info('Usage: agentinit skills update <name> --everywhere');
          return;
        }

        const entries = await installLock.findProjectsWithSkill(name);
        if (entries.length === 0) {
          logger.info(`No tracked installations found for skill "${name}".`);
          logger.info(dim('Install the skill first, then update with --everywhere.'));
          return;
        }

        logger.info(`Found ${cyan(String(entries.length))} tracked target(s) with skill "${green(name)}":\n`);

        const staleProjects: string[] = [];
        const updateTargets: LockEntry[] = [];

        for (const entry of entries) {
          const targetLabel = getLockEntryTargetLabel(entry);
          if (entry.scope !== 'global' && !(await fileExists(entry.projectPath))) {
            staleProjects.push(entry.projectPath);
            logger.info(`  ${red('x')} ${targetLabel} ${dim('(missing)')}`);
          } else {
            updateTargets.push(entry);
            logger.info(`  ${green('+')} ${targetLabel} ${dim(`[${entry.agents.join(', ')}]`)}`);
          }
        }

        if (staleProjects.length > 0) {
          logger.info('');
          logger.warn(`${staleProjects.length} project(s) no longer exist. Run "agentinit lock prune" to clean up.`);
        }

        if (updateTargets.length === 0) {
          logger.info('\nNo valid projects to update.');
          return;
        }

        if (options.dryRun) {
          logger.info(dim('\nDry run — no changes made.'));
          return;
        }

        logger.info('');
        const spinner = ora('Updating skills across projects...').start();
        let updatedCount = 0;
        let unchangedCount = 0;
        let failedCount = 0;

        for (const entry of updateTargets) {
            spinner.text = `Updating in ${getLockEntryTargetLabel(entry)}...`;

          try {
            const sourceString = lockSourceToString(entry.source);
            if (!sourceString) {
              failedCount++;
              logger.info(`  ${red('x')} ${getLockEntryTargetLabel(entry)}: cannot reconstruct source`);
              continue;
            }

            const agentManager = new AgentManager();
            const skillsManager = new SkillsManager(agentManager);

            const result = await skillsManager.addFromSource(
              sourceString.source,
              entry.projectPath,
              {
                ...(sourceString.from ? { from: sourceString.from } : {}),
                ...(sourceString.prefix ? { prefix: sourceString.prefix } : {}),
                agents: entry.agents,
                global: entry.scope === 'global',
                skills: [name],
                yes: true,
              },
            );

              if (result.updated.length > 0) {
                updatedCount++;
                logger.info(`  ${green('~')} ${getLockEntryTargetLabel(entry)}: updated`);
              } else if (result.installed.length > 0) {
                updatedCount++;
                logger.info(`  ${green('+')} ${getLockEntryTargetLabel(entry)}: installed`);
              } else {
                unchangedCount++;
                logger.info(`  ${dim('-')} ${getLockEntryTargetLabel(entry)}: ${dim('unchanged')}`);
              }
          } catch (error) {
            failedCount++;
            logger.info(`  ${red('x')} ${getLockEntryTargetLabel(entry)}: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        }

        if (updatedCount > 0) {
          spinner.succeed(`Updated "${name}" in ${updatedCount} target(s)`);
        } else {
          spinner.info(`"${name}" is already up to date in all tracked targets`);
        }

        if (unchangedCount > 0) logger.info(dim(`  ${unchangedCount} unchanged`));
        if (failedCount > 0) logger.info(red(`  ${failedCount} failed`));
      } else {
        // Update in current project only
        const cwd = process.cwd();
        const agentManager = new AgentManager();
        const skillsManager = new SkillsManager(agentManager);

        if (name) {
          // Update specific skill from lockfile source
          const entries = await installLock.getCurrentState({
            kind: 'skill',
            name,
            projectPath: resolve(cwd),
            scope: 'project',
          });

          if (entries.length === 0) {
            logger.info(`Skill "${name}" not tracked in the lockfile for this project.`);
            logger.info(dim('Try: agentinit skills add <source> or use --everywhere for global installs.'));
            return;
          }

          if (options.dryRun) {
            logger.info(`Would update "${name}" in ${entries.length} tracked target(s):`);
            for (const entry of entries) {
              const sourceString = lockSourceToString(entry.source);
              logger.info(`  ${green(entry.name)} ${dim(`[${entry.agents.join(', ')}]`)} ${sourceString ? dim(sourceString.source) : red('unavailable source')}`);
            }
            return;
          }

          const spinner = ora(`Updating skill "${name}"...`).start();
          let updatedCount = 0;
          let unchangedCount = 0;
          let failedCount = 0;

          for (const entry of entries) {
            const sourceString = lockSourceToString(entry.source);
            if (!sourceString) {
              failedCount++;
              continue;
            }

            try {
              const result = await skillsManager.addFromSource(
                sourceString.source,
                cwd,
                {
                ...(sourceString.from ? { from: sourceString.from } : {}),
                ...(sourceString.prefix ? { prefix: sourceString.prefix } : {}),
                agents: entry.agents,
                global: entry.scope === 'global',
                skills: [name],
                  yes: true,
                },
              );

              if (result.updated.length > 0 || result.installed.length > 0) {
                updatedCount++;
              } else {
                unchangedCount++;
              }
            } catch {
              failedCount++;
            }
          }

          if (updatedCount > 0) {
            spinner.succeed(`Updated "${name}" in ${updatedCount} target(s)`);
          } else {
            spinner.info(`"${name}" is already up to date`);
          }
          if (unchangedCount > 0) logger.info(dim(`  ${unchangedCount} unchanged`));
          if (failedCount > 0) logger.info(red(`  ${failedCount} failed`));
        } else {
          // Update all skills tracked for this project
          const entries = await installLock.getCurrentState({
            kind: 'skill',
            projectPath: resolve(cwd),
            scope: 'project',
          });

          if (entries.length === 0) {
            logger.info('No skills tracked in the lockfile for this project.');
            return;
          }

          if (options.dryRun) {
            logger.info(`Would update ${entries.length} skill(s):`);
            for (const entry of entries) {
              logger.info(`  ${green(entry.name)} ${dim(`[${entry.agents.join(', ')}]`)}`);
            }
            return;
          }

          const spinner = ora('Updating all skills...').start();
          let updatedCount = 0;

          for (const entry of entries) {
            const sourceString = lockSourceToString(entry.source);
            if (!sourceString) continue;

            spinner.text = `Updating "${entry.name}"...`;
            try {
              const result = await skillsManager.addFromSource(
                sourceString.source,
                cwd,
                {
                  ...(sourceString.from ? { from: sourceString.from } : {}),
                  ...(sourceString.prefix ? { prefix: sourceString.prefix } : {}),
                  agents: entry.agents,
                  global: entry.scope === 'global',
                  skills: [entry.name],
                  yes: true,
                },
              );

              if (result.updated.length > 0 || result.installed.length > 0) {
                updatedCount++;
              }
            } catch {
              // Continue with other skills
            }
          }

          if (updatedCount > 0) {
            spinner.succeed(`Updated ${updatedCount} skill(s)`);
          } else {
            spinner.info('All skills are up to date');
          }
        }
      }
    });
}

function lockSourceToString(source: LockSource): LockSourceSpecifier | null {
  return lockSourceToSpecifier(source);
}

async function resolveInteractiveSkillTargets(
  skillsManager: SkillsManager,
  agentManager: AgentManager,
  source: string,
  projectPath: string,
  options: { from?: string; global?: boolean; copy?: boolean; skills?: SkillInfo[] },
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
    choices: await Promise.all(availableGroups.map(async group => {
      const description = await buildSkillGroupPreviewDescription(skillsManager, group, projectPath, {
        global: installGlobal,
        ...(options.copy !== undefined ? { copy: options.copy } : {}),
        ...(options.skills !== undefined ? { skills: options.skills } : {}),
      });

      return {
        title: formatSkillGroupTitle(group),
        ...(description ? { description } : {}),
        value: group.kind === 'canonical-shared'
          ? [SHARED_SKILLS_TARGET_ID]
          : group.agents.map(agent => agent.id),
        selected: shouldPreselectSkillGroup(
          group,
          installGlobal,
          detectedGroups.length > 0,
          recommendedAgentId,
        ),
      };
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

function formatSkillSelectionHint(prefix: string): string {
  return `Press Space to select, A to select or deselect all, p to edit prefix, then Enter to confirm. Prefix: "${prefix}"`;
}

async function resolveInteractiveSkillSelection(
  skills: SkillInfo[],
  initialPrefix?: string,
): Promise<InteractiveSkillSelection> {
  let prefix = initialPrefix ?? '';
  let selectedSkills = new Set(skills.map(skill => skill.name));

  const promptForPrefix = async () => {
    const response = await prompts({
      type: 'text',
      name: 'prefix',
      message: 'Prefix to prepend to installed skill names:',
      initial: prefix,
    });

    if (typeof response.prefix === 'string') {
      prefix = response.prefix;
    }
  };

  const requestPrefixEdit = (controls: { requestAction: (action: string) => void; closeWithCurrentSelection: () => boolean }) => {
    controls.requestAction('edit-prefix');
    controls.closeWithCurrentSelection();
  };

  while (true) {
    const response = await promptMultiselect<string>({
      name: 'skills',
      message: `Select skills to install (${skills.length} found):`,
      min: 1,
      hint: () => formatSkillSelectionHint(prefix),
      hotkeys: {
        p: requestPrefixEdit,
        P: requestPrefixEdit,
      },
      choices: skills.map(skill => ({
        title: skill.name,
        value: skill.name,
        description: skill.description,
        selected: selectedSkills.has(skill.name),
      })),
    });

    if (response.skills && response.skills.length > 0) {
      selectedSkills = new Set(response.skills);
    }

    if (response.__agentinitAction === 'edit-prefix') {
      await promptForPrefix();
      continue;
    }

    if (!response.skills || response.skills.length === 0) {
      logger.info('No skills selected. Aborting.');
      return { aborted: true };
    }

    return { skills: response.skills, prefix };
  }
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

async function buildSkillGroupPreviewDescription(
  skillsManager: SkillsManager,
  group: SkillAgentGroup,
  projectPath: string,
  options: { global: boolean; copy?: boolean; skills?: SkillInfo[] },
): Promise<string | undefined> {
  const skills = options.skills || [];
  if (skills.length === 0) {
    return group.description || describeGlobalSkillGroup(group);
  }

  const statuses = await Promise.all(skills.map(async skill => ({
    skill,
    status: await skillsManager.previewInstallStatus(
      skill,
      projectPath,
      group.kind === 'canonical-shared'
        ? { global: options.global, sharedStore: true }
        : {
          global: options.global,
          ...(options.copy !== undefined ? { copy: options.copy } : {}),
          ...(group.agents[0] ? { agent: group.agents[0] } : {}),
        },
    ),
  })));

  const unchanged = statuses
    .filter(entry => entry.status === 'unchanged')
    .map(entry => entry.skill.name);
  const changed = statuses
    .filter(entry => entry.status === 'changed')
    .map(entry => entry.skill.name);
  const fresh = statuses
    .filter(entry => entry.status === 'new')
    .map(entry => entry.skill.name);

  const parts: string[] = [];
  if (fresh.length > 0) {
    parts.push(`Will install: ${fresh.join(', ')}`);
  }
  if (unchanged.length > 0) {
    parts.push(`Already up to date: ${unchanged.join(', ')}`);
  }
  if (changed.length > 0) {
    parts.push(`${changed.length === 1 ? 'Update available' : 'Updates available'}: ${changed.join(', ')}`);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join('. ');
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
  const hasInstalled = result.installed.length > 0;
  const hasUpdated = result.updated.length > 0;
  const hasUnchanged = result.unchanged.length > 0;
  const hasSkipped = result.skipped.length > 0;

  if (!hasInstalled && !hasUpdated && !hasUnchanged && !hasSkipped) {
    spinner.warn('No skills found in the source.');
    for (const warning of result.warnings) {
      logger.warn(warning);
    }
    return;
  }

  if (!hasInstalled && !hasUpdated && !hasUnchanged && hasSkipped && result.skipped.every(skip => skip.reason === 'No target agents found')) {
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

  // Build summary message
  if (!hasInstalled && !hasUpdated && hasUnchanged) {
    const uniqueUnchanged = new Set(result.unchanged.map(item => item.skill.name));
    spinner.info(`${uniqueUnchanged.size} skill(s) already up to date`);
    logger.info(dim(`  Already installed: ${[...uniqueUnchanged].join(', ')}`));
  } else {
    const parts: string[] = [];
    if (hasInstalled) {
      const uniqueInstallCount = new Set(
        result.installed.map(item => `${item.path}:${item.skill.name}`)
      ).size;
      parts.push(`Installed ${green(String(uniqueInstallCount))}`);
    }
    if (hasUpdated) {
      const uniqueUpdateCount = new Set(
        result.updated.map(item => `${item.path}:${item.skill.name}`)
      ).size;
      parts.push(`Updated ${yellow(String(uniqueUpdateCount))}`);
    }
    if (hasUnchanged) {
      const uniqueUnchanged = new Set(result.unchanged.map(item => item.skill.name)).size;
      parts.push(`${uniqueUnchanged} already up to date`);
    }
    spinner.succeed(`${parts.join(', ')} skill(s)`);

    // Show per-path breakdown for installed
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

    // Show per-path breakdown for updated
    const byPathUpdated = new Map<string, { agents: Set<string>; skills: Set<string> }>();
    for (const item of result.updated) {
      const path = item.path;
      const existing = byPathUpdated.get(path) || {
        agents: new Set<string>(),
        skills: new Set<string>(),
      };
      existing.agents.add(formatSkillTargetName(agentManager, item.agent));
      existing.skills.add(item.skill.name);
      byPathUpdated.set(path, existing);
    }
    for (const [path, details] of byPathUpdated) {
      logger.info(`  ${relative(process.cwd(), path) || path}`);
      logger.info(`    Agents: ${[...details.agents].join(', ')}`);
      logger.info(`    Skills: ${yellow(String(details.skills.size))} updated (${[...details.skills].join(', ')})`);
    }
  }

  const copiedFallbacks = [...result.installed, ...result.updated].filter(item => item.symlinkFailed);
  if (copiedFallbacks.length > 0) {
    logger.warn(`Symlink creation failed for ${copiedFallbacks.length} install(s); copied the skill files instead.`);
  }

  // Show skipped skills
  if (hasSkipped) {
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

  if (hasInstalled || hasUpdated) {
    logger.success('Skills installation complete.');
  }
}
