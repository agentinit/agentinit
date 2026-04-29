import { Command } from 'commander';
import { AgentSettingsManager } from '../core/agentSettings/settingsManager.js';
import type { AgentSettingsScope } from '../core/agentSettings/types.js';
import { cyan, dim, green } from '../utils/colors.js';
import { logger } from '../utils/logger.js';

interface ScopeOptions {
  global?: boolean;
  project?: boolean;
  local?: boolean;
}

interface AgentCommandOptions extends ScopeOptions {
  json?: boolean;
  valueJson?: boolean;
  dryRun?: boolean;
  command?: string;
  env?: string;
  key?: string;
  matcher?: string;
  name?: string;
}

function failAgentCommand(error: unknown): void {
  logger.error(error instanceof Error ? error.message : 'Agent settings command failed.');
  process.exitCode = 1;
}

function resolveScopeOption(options: ScopeOptions): AgentSettingsScope | undefined {
  const requested = [
    options.global ? 'global' : null,
    options.project ? 'project' : null,
    options.local ? 'local' : null,
  ].filter(Boolean) as AgentSettingsScope[];

  if (requested.length > 1) {
    throw new Error('Choose only one scope: --global, --project, or --local.');
  }

  return requested[0];
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value === undefined ? null : value, null, 2));
}

function printValue(value: unknown): void {
  if (value === undefined) {
    logger.info('Not set.');
    return;
  }
  if (typeof value === 'string') {
    console.log(value);
    return;
  }
  printJson(value);
}

function buildSetOptions(options: AgentCommandOptions) {
  const result: {
    scope?: AgentSettingsScope;
    parseJson?: boolean;
    dryRun?: boolean;
  } = {};
  const scope = resolveScopeOption(options);
  if (scope) {
    result.scope = scope;
  }
  if (options.valueJson !== undefined) {
    result.parseJson = options.valueJson;
  }
  if (options.dryRun !== undefined) {
    result.dryRun = options.dryRun;
  }
  return result;
}

function buildReadOptions(options: AgentCommandOptions) {
  const result: {
    scope?: AgentSettingsScope;
  } = {};
  const scope = resolveScopeOption(options);
  if (scope) {
    result.scope = scope;
  }
  return result;
}

function buildHookAddOptions(options: AgentCommandOptions) {
  const result: {
    scope?: AgentSettingsScope;
    matcher?: string;
    name?: string;
    dryRun?: boolean;
  } = {};
  const scope = resolveScopeOption(options);
  if (scope) {
    result.scope = scope;
  }
  if (options.matcher !== undefined) {
    result.matcher = options.matcher;
  }
  if (options.name !== undefined) {
    result.name = options.name;
  }
  if (options.dryRun !== undefined) {
    result.dryRun = options.dryRun;
  }
  return result;
}

function buildHookRemoveOptions(options: AgentCommandOptions) {
  const result: {
    scope?: AgentSettingsScope;
    matcher?: string;
    dryRun?: boolean;
  } = {};
  const scope = resolveScopeOption(options);
  if (scope) {
    result.scope = scope;
  }
  if (options.matcher !== undefined) {
    result.matcher = options.matcher;
  }
  if (options.dryRun !== undefined) {
    result.dryRun = options.dryRun;
  }
  return result;
}

function resolveApiKeyOption(options: AgentCommandOptions): string {
  if (options.env && options.key) {
    throw new Error('Choose only one API key source: --env or --key.');
  }
  if (options.env) {
    const value = process.env[options.env];
    if (!value) {
      throw new Error(`Environment variable ${options.env} is not set.`);
    }
    return value;
  }
  if (options.key) {
    return options.key;
  }
  throw new Error('API key source is required. Use --env <name> or --key <key>.');
}

function warnForRawApiKeyOption(options: AgentCommandOptions): void {
  if (options.key && !options.json) {
    logger.warning('Using --key can expose the raw API key in shell history and process listings. Prefer --env when possible.');
  }
}

function buildApiKeyOptions(options: AgentCommandOptions) {
  return {
    dryRun: Boolean(options.dryRun),
  };
}

function apiKeyActionVerb(action: 'approve' | 'reject' | 'forget', dryRun: boolean): string {
  if (dryRun) {
    return `Would ${action}`;
  }
  switch (action) {
    case 'approve':
      return 'Approved';
    case 'reject':
      return 'Rejected';
    case 'forget':
      return 'Forgot';
  }
}

export function registerAgentCommand(program: Command): void {
  const manager = new AgentSettingsManager();
  const agent = program
    .command('agent')
    .description('Manage native agent settings');

  agent
    .command('set <agent> <key> <value...>')
    .description('Set an agent setting')
    .option('--global', 'Write global user settings')
    .option('--project', 'Write shared project settings')
    .option('--local', 'Write local project settings')
    .option('--value-json', 'Parse the value as JSON for arrays and objects')
    .option('--json', 'Print JSON output')
    .option('--dry-run', 'Preview the write without changing files')
    .action(async (agentId: string, key: string, valueParts: string[], options: AgentCommandOptions) => {
      try {
        const value = valueParts.join(' ');
        const result = await manager.set(agentId, key, value, buildSetOptions(options));

        if (options.json) {
          printJson(result);
          return;
        }

        const verb = result.dryRun ? 'Would set' : 'Set';
        logger.success(`${verb} ${green(result.agent)} ${cyan(result.key)} in ${result.scope} settings.`);
        logger.info(`Path: ${result.path}`);
      } catch (error) {
        failAgentCommand(error);
      }
    });

  const hook = agent
    .command('hook')
    .description('Manage native agent hooks with typed operations');

  hook
    .command('add <agent> <event>')
    .description('Add a command hook without replacing existing hooks')
    .option('--command <command>', 'Shell command to execute for this hook')
    .option('--matcher <matcher>', 'Claude hook matcher, defaults to all matching tools/events')
    .option('--name <name>', 'Stable name used to identify this hook later')
    .option('--global', 'Write global user settings')
    .option('--project', 'Write shared project settings')
    .option('--local', 'Write local project settings')
    .option('--json', 'Print JSON output')
    .option('--dry-run', 'Preview the write without changing files')
    .action(async (agentId: string, event: string, options: AgentCommandOptions) => {
      try {
        if (!options.command) {
          throw new Error('agent hook add requires --command <command>.');
        }

        const result = await manager.addHook(agentId, event, options.command, buildHookAddOptions(options));
        if (options.json) {
          printJson(result);
          return;
        }

        const verb = result.dryRun ? 'Would add' : 'Added';
        logger.success(`${verb} ${green(result.agent)} ${cyan(result.event)} hook in ${result.scope} settings.`);
        logger.info(`Path: ${result.path}`);
      } catch (error) {
        failAgentCommand(error);
      }
    });

  hook
    .command('list <agent> [event]')
    .description('List configured hooks')
    .option('--global', 'Read global user settings')
    .option('--project', 'Read shared project settings')
    .option('--local', 'Read local project settings')
    .option('--json', 'Print JSON output')
    .action(async (agentId: string, event: string | undefined, options: AgentCommandOptions) => {
      try {
        const hooks = await manager.listHooks(agentId, event, buildReadOptions(options));
        if (options.json) {
          printJson(hooks);
          return;
        }

        logger.titleBox(`AgentInit  ${agentId} Hooks`);
        if (Array.isArray(hooks)) {
          hooks.forEach((entry, index) => logger.tree(
            `${cyan(entry.matcher ?? '*')} ${entry.hooks.map(hook => hook.name ?? hook.command ?? hook.type ?? 'hook').join(', ')}`,
            index === hooks.length - 1,
          ));
          return;
        }

        const entries = Object.entries(hooks);
        if (entries.length === 0) {
          logger.info('No hooks configured.');
          return;
        }
        entries.forEach(([hookEvent, matchers], index) => logger.tree(`${cyan(hookEvent)} ${matchers.length} matcher(s)`, index === entries.length - 1));
      } catch (error) {
        failAgentCommand(error);
      }
    });

  hook
    .command('remove <agent> <event> <commandOrName>')
    .alias('rm')
    .description('Remove hooks by command string or hook name')
    .option('--matcher <matcher>', 'Only remove hooks from this matcher')
    .option('--global', 'Write global user settings')
    .option('--project', 'Write shared project settings')
    .option('--local', 'Write local project settings')
    .option('--json', 'Print JSON output')
    .option('--dry-run', 'Preview the write without changing files')
    .action(async (agentId: string, event: string, commandOrName: string, options: AgentCommandOptions) => {
      try {
        const result = await manager.removeHook(agentId, event, commandOrName, buildHookRemoveOptions(options));
        if (options.json) {
          printJson(result);
          return;
        }

        const verb = result.dryRun ? 'Would remove' : 'Removed';
        logger.success(`${verb} ${result.removed ?? 0} ${green(result.agent)} ${cyan(result.event)} hook(s) from ${result.scope} settings.`);
        logger.info(`Path: ${result.path}`);
      } catch (error) {
        failAgentCommand(error);
      }
    });

  const apiKey = agent
    .command('api-key')
    .description('Manage Claude custom API key trust responses');

  apiKey
    .command('status <agent>')
    .description('Check whether a custom API key is approved, rejected, or unknown')
    .option('--env <name>', 'Read the API key from this environment variable')
    .option('--key <key>', 'Use this API key value directly; prefer --env to avoid shell-history exposure')
    .option('--json', 'Print JSON output')
    .action(async (agentId: string, options: AgentCommandOptions) => {
      try {
        warnForRawApiKeyOption(options);
        const result = await manager.getApiKeyStatus(agentId, resolveApiKeyOption(options));
        if (options.json) {
          printJson(result);
          return;
        }

        logger.info(`${green(result.agent)} API key fingerprint ${cyan(result.fingerprint)} is ${result.status}.`);
        logger.info(`Path: ${result.path}`);
      } catch (error) {
        failAgentCommand(error);
      }
    });

  for (const action of ['approve', 'reject', 'forget'] as const) {
    apiKey
      .command(`${action} <agent>`)
      .description(`${action[0]!.toUpperCase()}${action.slice(1)} a custom API key trust response`)
      .option('--env <name>', 'Read the API key from this environment variable')
      .option('--key <key>', 'Use this API key value directly; prefer --env to avoid shell-history exposure')
      .option('--json', 'Print JSON output')
      .option('--dry-run', 'Preview the write without changing files')
      .action(async (agentId: string, options: AgentCommandOptions) => {
        try {
          warnForRawApiKeyOption(options);
          const result = await manager.updateApiKeyTrust(agentId, action, resolveApiKeyOption(options), buildApiKeyOptions(options));
          if (options.json) {
            printJson(result);
            return;
          }

          logger.success(`${apiKeyActionVerb(action, result.dryRun)} ${green(result.agent)} API key fingerprint ${cyan(result.fingerprint)}.`);
          logger.info(`Status: ${result.status}`);
          logger.info(`Path: ${result.path}`);
        } catch (error) {
          failAgentCommand(error);
        }
      });
  }

  agent
    .command('get <agent> [key]')
    .description('Get an agent setting or settings file')
    .option('--global', 'Read global user settings')
    .option('--project', 'Read shared project settings')
    .option('--local', 'Read local project settings')
    .option('--json', 'Print JSON output')
    .action(async (agentId: string, key: string | undefined, options: AgentCommandOptions) => {
      try {
        const value = await manager.get(agentId, key, buildReadOptions(options));
        if (options.json) {
          printJson(value);
          return;
        }
        printValue(value);
      } catch (error) {
        failAgentCommand(error);
      }
    });

  agent
    .command('unset <agent> <key>')
    .description('Unset an agent setting')
    .option('--global', 'Write global user settings')
    .option('--project', 'Write shared project settings')
    .option('--local', 'Write local project settings')
    .option('--json', 'Print JSON output')
    .option('--dry-run', 'Preview the write without changing files')
    .action(async (agentId: string, key: string, options: AgentCommandOptions) => {
      try {
        const result = await manager.unset(agentId, key, buildSetOptions(options));

        if (options.json) {
          printJson(result);
          return;
        }

        const verb = result.dryRun ? 'Would unset' : 'Unset';
        logger.success(`${verb} ${green(result.agent)} ${cyan(result.key)} in ${result.scope} settings.`);
        logger.info(`Path: ${result.path}`);
      } catch (error) {
        failAgentCommand(error);
      }
    });

  agent
    .command('list [agent]')
    .description('List supported agents or setting keys for one agent')
    .option('--json', 'Print JSON output')
    .action((agentId: string | undefined, options: AgentCommandOptions) => {
      try {
        if (!agentId) {
          const agents = manager.getSupportedAgents();
          if (options.json) {
            printJson(agents);
            return;
          }
          logger.titleBox('AgentInit  Agent Settings');
          agents.forEach((entry, index) => logger.tree(cyan(entry), index === agents.length - 1));
          return;
        }

        const schema = manager.getSchema(agentId);
        const keys = schema.settings.map(setting => setting.key);
        if (options.json) {
          printJson(keys);
          return;
        }

        logger.titleBox(`AgentInit  ${agentId} Settings`);
        schema.settings.forEach((setting, index) => logger.tree(`${cyan(setting.key)} ${dim(setting.category)}`, index === schema.settings.length - 1));
      } catch (error) {
        failAgentCommand(error);
      }
    });

  agent
    .command('schema <agent>')
    .description('Show the setting schema for an agent')
    .option('--json', 'Print JSON output')
    .action((agentId: string, options: AgentCommandOptions) => {
      try {
        const schema = manager.getSchema(agentId);
        if (options.json) {
          printJson(schema);
          return;
        }

        logger.titleBox(`AgentInit  ${schema.displayName} Schema`);
        logger.info(`Default omitted scope: ${cyan(schema.effectiveDefaultScope)}`);
        for (const setting of schema.settings) {
          const flags = [
            setting.valueType,
            setting.category,
            setting.risk !== 'safe' ? setting.risk : null,
            setting.deprecated ? `use ${setting.replacement}` : null,
          ].filter(Boolean).join(', ');
          logger.tree(`${cyan(setting.key)} ${dim(`[${flags}]`)} ${setting.description}`, false);
        }
      } catch (error) {
        failAgentCommand(error);
      }
    });
}
