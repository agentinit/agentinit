import { Command } from 'commander';
import ora from 'ora';
import { green, yellow, red, cyan, dim } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { RulesParser } from '../core/rulesParser.js';
import { AgentManager } from '../core/agentManager.js';
import { TOKEN_COUNT_THRESHOLDS } from '../constants/index.js';
import { readFileIfExists, writeFile } from '../utils/fs.js';
import type { Agent } from '../agents/Agent.js';
import type { AppliedRules, RuleSection, RuleApplicationResult } from '../types/rules.js';

// ── Token display helpers ──────────────────────────────────────────────────

function colorizeTokenCount(tokenCount: number): string {
  if (tokenCount <= TOKEN_COUNT_THRESHOLDS.LOW) return green(tokenCount.toString());
  if (tokenCount <= TOKEN_COUNT_THRESHOLDS.MEDIUM) return yellow(tokenCount.toString());
  return red(tokenCount.toString());
}

function colorizeTokenDiff(diff: number): string {
  if (diff === 0) return '\u00b10';
  if (diff > 0) return green(`+${diff}`);
  return red(`${diff}`);
}

// ── Agent / path resolution helpers ────────────────────────────────────────

/**
 * Resolve target agents from CLI options.
 * When --agent is supplied, returns only those agents.
 * When --global is set, validates that --agent is also present.
 * Otherwise auto-detects agents in the current project.
 */
async function resolveTargetAgents(
  agentManager: AgentManager,
  options: { agent?: string[]; global?: boolean },
  cwd: string,
): Promise<Agent[]> {
  if (options.global && !options.agent?.length) {
    logger.error('--global flag requires --agent to specify target agent(s)');
    logger.info('Example: agentinit rules add --global --agent claude --template git');
    process.exit(1);
  }

  if (options.agent?.length) {
    const agents: Agent[] = [];
    for (const id of options.agent) {
      const agent = agentManager.getAgentById(id);
      if (!agent) {
        logger.error(`Unknown agent: ${id}`);
        logger.info(`Supported agents: ${agentManager.getSupportedAgentIds().join(', ')}`);
        process.exit(1);
      }
      if (options.global && !agent.supportsGlobalRules()) {
        logger.error(`Agent ${agent.name} does not support global rules`);
        process.exit(1);
      }
      agents.push(agent);
    }
    return agents;
  }

  // Auto-detect
  const detected = await agentManager.detectAgents(cwd);
  if (detected.length === 0) {
    logger.warning('No AI coding agents detected in this project');
    logger.info('Supported agents:');
    agentManager.getAllAgents().forEach(a => {
      logger.info(`  - ${a.name} (${a.id})`);
    });
    logger.info('');
    logger.info('To target a specific agent, use: --agent <agent-id>');
    process.exit(0);
  }
  return detected.map(d => d.agent);
}

function getRulesConfigPath(agent: Agent, projectPath: string, isGlobal: boolean): string | null {
  return isGlobal ? agent.getGlobalRulesPath() : agent.getProjectRulesPath(projectPath);
}

function buildAppliedRules(sections: RuleSection[]): AppliedRules {
  const merged = sections.flatMap(section => section.rules);

  return {
    templateRules: merged,
    rawRules: [],
    fileRules: [],
    remoteRules: [],
    merged,
    sections,
  };
}

// ── Command registration ───────────────────────────────────────────────────

export function registerRulesCommand(program: Command): void {
  const rules = program
    .command('rules')
    .description('Manage agent rules');

  // ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  //  rules add
  // ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  rules
    .command('add')
    .description('Add rules to agent configuration')
    .option('-t, --template <templates...>', 'Rule templates to apply (comma-separated values accepted)')
    .option('-r, --raw <rules...>', 'Raw rule strings')
    .option('-f, --file <path>', 'Load rules from a file')
    .option('--remote <url>', 'Load rules from a remote URL')
    .option('--auth <token>', 'Authentication token for remote rules (Bearer token)')
    .option('-a, --agent <agents...>', 'Target specific agent(s)')
    .option('-g, --global', 'Apply rules globally')
    .action(async (options) => {
      logger.title('📏 AgentInit - Rules');

      const cwd = process.cwd();
      const isGlobal = !!options.global;

      // 1. Build RulesConfig from options
      const templates: string[] = [];
      if (options.template) {
        for (const val of options.template as string[]) {
          templates.push(...val.split(',').map((t: string) => t.trim()).filter(Boolean));
        }
      }

      const rulesConfig: { templates: string[]; rawRules: string[]; fileRules?: string; remoteRules?: { url: string; auth?: string } } = {
        templates,
        rawRules: (options.raw as string[] | undefined) || [],
      };
      if (options.file) {
        rulesConfig.fileRules = options.file as string;
      }
      if (options.remote) {
        const remote: { url: string; auth?: string } = { url: options.remote as string };
        if (options.auth) remote.auth = options.auth as string;
        rulesConfig.remoteRules = remote;
      }

      if (templates.length === 0 && rulesConfig.rawRules.length === 0 && !rulesConfig.fileRules && !rulesConfig.remoteRules) {
        logger.info('No rules specified. Use one of:');
        logger.info('  --template <templates...>  Rule templates (git, write_docs, use_git_worktrees, use_subagents, use_linter, write_tests)');
        logger.info('  --raw <rules...>           Raw rule strings');
        logger.info('  --file <path>              Load rules from a file');
        logger.info('  --remote <url>             Load rules from a remote URL');
        logger.info('');
        logger.info('Example: agentinit rules add --template git,write_tests');
        return;
      }

      const spinner = ora('Processing rules...').start();

      try {
        // 2. Process rules
        const rulesParser = new RulesParser();

        // Validate template IDs
        if (templates.length > 0) {
          const invalid = rulesParser.validateTemplateIds(templates);
          if (invalid.length > 0) {
            spinner.fail(`Unknown rule templates: ${invalid.join(', ')}`);
            logger.info('Available templates: git, write_docs, use_git_worktrees, use_subagents, use_linter, write_tests');
            process.exit(1);
          }
        }

        const appliedRules = await rulesParser.processRules(rulesConfig);

        if (appliedRules.merged.length === 0) {
          spinner.warn('No rules to apply');
          return;
        }

        // 3. Resolve target agents
        spinner.text = 'Resolving agents...';
        const agentManager = new AgentManager();
        const agents = await resolveTargetAgents(agentManager, options, cwd);

        // 4. Apply rules to each agent
        const results: Array<{ agent: Agent; result: RuleApplicationResult }> = [];

        for (const agent of agents) {
          if (!agent.capabilities.rules) {
            logger.warning(`${agent.name}: Rules not supported, skipping`);
            continue;
          }

          spinner.text = `Applying rules to ${agent.name}...`;

          let result: RuleApplicationResult;
          if (isGlobal) {
            result = await agent.applyGlobalRules(appliedRules);
          } else {
            result = await agent.applyRules(cwd, appliedRules);
          }
          results.push({ agent, result });
        }

        if (results.length === 0) {
          spinner.warn('No agents with rules support found');
          return;
        }

        spinner.succeed('Rules applied successfully!');

        // 5. Report results
        logger.info('');

        // Summarise sections
        const allSections = results.flatMap(r => r.result.mergedSections || []);
        const uniqueSections = Array.from(
          new Map(allSections.map(s => [s.templateId, s])).values()
        );

        const totalExisting = results.reduce((s, r) => s + (r.result.existingCount || 0), 0);
        const totalNew = results.reduce((s, r) => s + (r.result.newlyAppliedCount || 0), 0);

        if (totalExisting > 0) {
          const existingSectionCount = uniqueSections.filter(section =>
            section.rules.some(rule => results.some(r => r.result.existingRules?.includes(rule)))
          ).length;
          logger.info(`Already exists (${existingSectionCount} section${existingSectionCount !== 1 ? 's' : ''}):`);
          uniqueSections.forEach(section => {
            const existingRulesInSection = section.rules.filter(rule =>
              results.some(r => r.result.existingRules?.includes(rule))
            );
            if (existingRulesInSection.length > 0) {
              logger.info(`  - ${section.templateName} (${existingRulesInSection.length} rules)`);
            }
          });
        }

        if (totalNew > 0) {
          if (totalExisting > 0) logger.info('');
          const newSectionCount = uniqueSections.filter(section =>
            section.rules.some(rule => results.some(r => r.result.newlyApplied?.includes(rule)))
          ).length;
          logger.info(`Applied (${newSectionCount} section${newSectionCount !== 1 ? 's' : ''}):`);
          uniqueSections.forEach(section => {
            const newRulesInSection = section.rules.filter(rule =>
              results.some(r => r.result.newlyApplied?.includes(rule))
            );
            if (newRulesInSection.length > 0) {
              logger.info(`  - ${section.templateName} (${newRulesInSection.length} rules)`);
            }
          });
        }

        // Per-agent breakdown
        logger.info('');
        logger.info(isGlobal ? 'Agents (global):' : 'Agents:');

        for (const { agent, result } of results) {
          logger.info(`  - ${agent.name}`);

          if (result.rulesApplied > 0) {
            if (result.totalFileTokens && result.totalFileTokens > 0) {
              const totalColored = colorizeTokenCount(result.totalFileTokens);
              const diffColored = colorizeTokenDiff(result.tokenDiff || 0);
              logger.info(`    Total File: ${totalColored} tokens (${diffColored})`);
            }
            if (result.configPath) {
              logger.info(`    Config: ${result.configPath}`);
            }
            if (result.totalFileTokens && result.totalFileTokens > 30000) {
              logger.warning(`    Config file is overweight (>30k tokens). Consider reducing rules.`);
            }
          }

          if (!result.success && result.errors?.length) {
            for (const err of result.errors) {
              logger.error(`    ${err}`);
            }
          }
        }
      } catch (error) {
        spinner.fail('Failed to apply rules');
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  //  rules list (alias: ls)
  // ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  rules
    .command('list')
    .alias('ls')
    .description('List rules configured for each agent')
    .option('-a, --agent <agents...>', 'Filter by specific agent(s)')
    .option('-g, --global', 'List global rules')
    .action(async (options) => {
      logger.title('📏 AgentInit - Rules');

      const cwd = process.cwd();
      const isGlobal = !!options.global;
      const agentManager = new AgentManager();
      const agents = await resolveTargetAgents(agentManager, options, cwd);

      let foundAny = false;

      for (const agent of agents) {
        if (!agent.capabilities.rules) {
          continue;
        }

        const configPath = getRulesConfigPath(agent, cwd, isGlobal);
        if (!configPath) continue;

        const content = await readFileIfExists(configPath);
        if (!content) {
          logger.info(`\n  ${cyan(agent.name)} ${dim('(no rules config found)')}`);
          continue;
        }

        const sections = agent.extractExistingSections(content);

        if (sections.length === 0) {
          logger.info(`\n  ${cyan(agent.name)} ${dim('(no rules sections found)')}`);
          continue;
        }

        foundAny = true;
        logger.info(`\n  ${cyan(agent.name)}`);
        logger.info(`  Config: ${configPath}`);

        for (const section of sections) {
          logger.info(`\n    ${green(section.templateName)} ${dim(`(${section.rules.length} rules)`)}`);
          for (const rule of section.rules) {
            logger.info(`      - ${rule}`);
          }
        }
      }

      if (!foundAny) {
        logger.info('');
        logger.info('No rules found. Add rules with:');
        logger.info('  agentinit rules add --template git,write_tests');
      }
    });

  // ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  //  rules remove [names...] (alias: rm)
  // ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  rules
    .command('remove [names...]')
    .alias('rm')
    .description('Remove rule sections by template ID (e.g. git, write_docs)')
    .option('-a, --agent <agents...>', 'Target specific agent(s)')
    .option('-g, --global', 'Remove from global rules')
    .action(async (names: string[], options) => {
      logger.title('📏 AgentInit - Rules');

      if (!names || names.length === 0) {
        logger.error('Please specify rule section name(s) to remove.');
        logger.info('Usage: agentinit rules remove <name...>');
        logger.info('');
        logger.info('Section names correspond to template IDs (e.g. git, write_docs, use_linter)');
        logger.info('Run "agentinit rules list" to see current sections.');
        return;
      }

      const cwd = process.cwd();
      const isGlobal = !!options.global;
      const agentManager = new AgentManager();
      const agents = await resolveTargetAgents(agentManager, options, cwd);

      const spinner = ora('Removing rules...').start();

      let totalRemoved = 0;

      try {
        for (const agent of agents) {
          if (!agent.capabilities.rules) {
            continue;
          }

          const configPath = getRulesConfigPath(agent, cwd, isGlobal);
          if (!configPath) continue;

          const content = await readFileIfExists(configPath);
          if (!content) continue;

          const sections = agent.extractExistingSections(content);
          if (sections.length === 0) continue;

          // Normalise lookup: names are matched against templateId
          const namesToRemove = new Set(names.map(n => n.toLowerCase().replace(/\s+/g, '_')));
          const remaining = sections.filter(s => !namesToRemove.has(s.templateId));
          const removed = sections.filter(s => namesToRemove.has(s.templateId));

          if (removed.length === 0) {
            continue;
          }

          const updatedContent = await agent.applyRulesConfig(
            configPath,
            buildAppliedRules(remaining),
            content,
          );

          await writeFile(configPath, updatedContent);
          totalRemoved += removed.length;

          for (const s of removed) {
            logger.info(`  ${agent.name}: removed ${green(s.templateName)} (${s.rules.length} rules)`);
          }
        }

        if (totalRemoved === 0) {
          spinner.warn('No matching rule sections found to remove');
          logger.info('Run "agentinit rules list" to see current sections.');
        } else {
          spinner.succeed(`Removed ${totalRemoved} rule section${totalRemoved !== 1 ? 's' : ''}`);
        }
      } catch (error) {
        spinner.fail('Failed to remove rules');
        logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}
