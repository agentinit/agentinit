import { existsSync } from 'fs';
import { join } from 'path';
import { expandTilde } from '../../../utils/paths.js';
import type { AgentSettingsAdapter, AgentSettingDefinition, AgentSettingsScope } from '../types.js';

const SUPPORTED_SCOPES: AgentSettingsScope[] = ['global', 'project'];
const PERMISSION_ACTIONS = ['allow', 'ask', 'deny'];

function firstExistingPath(paths: string[], fallback: string): string {
  return paths.find(candidate => existsSync(candidate)) ?? fallback;
}

function setting(
  key: string,
  valueType: AgentSettingDefinition['valueType'],
  title: string,
  description: string,
  options: Partial<Omit<AgentSettingDefinition, 'agent' | 'key' | 'title' | 'description' | 'valueType'>> = {},
): AgentSettingDefinition {
  const definition: AgentSettingDefinition = {
    agent: 'opencode',
    key,
    nativePath: options.nativePath ?? key.split('.'),
    title,
    description,
    valueType,
    scopes: options.scopes ?? SUPPORTED_SCOPES,
    defaultScope: options.defaultScope ?? 'global',
    category: options.category ?? 'settings',
    risk: options.risk ?? 'safe',
  };

  if (options.allowedValues) {
    definition.allowedValues = options.allowedValues;
  }
  if (options.deprecated !== undefined) {
    definition.deprecated = options.deprecated;
  }
  if (options.replacement) {
    definition.replacement = options.replacement;
  }

  return definition;
}

export const opencodeSettingsAdapter: AgentSettingsAdapter = {
  agent: 'opencode',
  displayName: 'OpenCode',
  format: 'jsonc',
  definitions: [
    setting('model', 'string', 'Model', 'Default model identifier in provider/model format (e.g. anthropic/claude-sonnet-4-5).', {
      category: 'model',
    }),
    setting('small_model', 'string', 'Small model', 'Small model used for tasks such as title generation, in provider/model format.', {
      category: 'model',
    }),
    setting('provider', 'object', 'Providers', 'Custom OpenCode provider configurations and model overrides.', {
      category: 'provider',
      risk: 'security-sensitive',
    }),
    setting('default_agent', 'string', 'Default agent', 'Default primary agent to use when none is specified.', {
      category: 'agent',
    }),
    setting('autoupdate', 'booleanOrEnum', 'Auto update', 'Control automatic updates: true, false, or notify.', {
      allowedValues: ['notify'],
      scopes: ['global'],
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('shell', 'string', 'Shell', 'Default shell to use for terminal and bash tool execution.', {
      category: 'runtime',
    }),
    setting('share', 'enum', 'Share', 'Control sharing behavior: manual, auto, or disabled.', {
      allowedValues: ['manual', 'auto', 'disabled'],
      category: 'sharing',
    }),
    setting('username', 'string', 'Username', 'Custom username displayed in conversations instead of system username.', {
      category: 'ui',
    }),
    setting('logLevel', 'enum', 'Log level', 'Log verbosity level.', {
      allowedValues: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
      category: 'runtime',
    }),
    setting('snapshot', 'boolean', 'Snapshot tracking', 'Enable or disable filesystem snapshot tracking for undo/redo.', {
      category: 'runtime',
    }),
    setting('permission.*', 'enum', 'Default permission', 'Fallback permission rule for all tools: allow, ask, or deny.', {
      nativePath: ['permission', '*'],
      category: 'permissions',
      risk: 'security-sensitive',
      allowedValues: PERMISSION_ACTIONS,
    }),
    setting('permission.bash', 'enum', 'Bash permission', 'Permission rule for shell command execution.', {
      category: 'permissions',
      risk: 'security-sensitive',
      allowedValues: PERMISSION_ACTIONS,
    }),
    setting('permission.read', 'enum', 'Read permission', 'Permission rule for file reads.', {
      category: 'permissions',
      allowedValues: PERMISSION_ACTIONS,
    }),
    setting('permission.edit', 'enum', 'Edit permission', 'Permission rule for editing and writing files.', {
      category: 'permissions',
      risk: 'risky',
      allowedValues: PERMISSION_ACTIONS,
    }),
    setting('permission.webfetch', 'enum', 'Web fetch permission', 'Permission rule for fetching external URLs.', {
      category: 'permissions',
      allowedValues: PERMISSION_ACTIONS,
    }),
    setting('permission.task', 'enum', 'Task permission', 'Permission rule for spawning subagent tasks.', {
      category: 'permissions',
      allowedValues: PERMISSION_ACTIONS,
    }),
    setting('permission.websearch', 'enum', 'Web search permission', 'Permission rule for web search operations.', {
      category: 'permissions',
      allowedValues: PERMISSION_ACTIONS,
    }),
    setting('compaction.auto', 'boolean', 'Auto compaction', 'Enable automatic context compaction when context is full.', {
      category: 'compaction',
    }),
    setting('tool_output.max_lines', 'positiveInteger', 'Tool output max lines', 'Maximum lines of tool output before truncation.', {
      category: 'output',
    }),
    setting('tool_output.max_bytes', 'positiveInteger', 'Tool output max bytes', 'Maximum bytes of tool output before truncation.', {
      category: 'output',
    }),
  ],
  getSettingsPath(scope: AgentSettingsScope, projectPath: string): string {
    switch (scope) {
      case 'global':
        return firstExistingPath([
          expandTilde('~/.config/opencode/opencode.jsonc'),
          expandTilde('~/.config/opencode/opencode.json'),
          expandTilde('~/.config/opencode/config.json'),
        ], expandTilde('~/.config/opencode/opencode.json'));
      case 'project':
        return firstExistingPath([
          join(projectPath, '.opencode', 'opencode.jsonc'),
          join(projectPath, '.opencode', 'opencode.json'),
        ], join(projectPath, '.opencode', 'opencode.json'));
      case 'local':
        throw new Error('OpenCode settings do not support local scope. Use --global or --project.');
    }
  },
};
