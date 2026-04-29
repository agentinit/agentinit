import { join } from 'path';
import { expandTilde } from '../../../utils/paths.js';
import type { AgentHookEvent, AgentSettingsAdapter, AgentSettingDefinition, AgentSettingsScope } from '../types.js';

const ALL_SCOPES: AgentSettingsScope[] = ['global', 'project'];
const CODEX_HOOK_EVENTS: AgentHookEvent[] = [
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'SessionStart',
  'UserPromptSubmit',
  'Stop',
];

function setting(
  key: string,
  valueType: AgentSettingDefinition['valueType'],
  title: string,
  description: string,
  options: Partial<Omit<AgentSettingDefinition, 'agent' | 'key' | 'nativePath' | 'title' | 'description' | 'valueType'>> = {},
): AgentSettingDefinition {
  const definition: AgentSettingDefinition = {
    agent: 'codex',
    key,
    nativePath: key.split('.'),
    title,
    description,
    valueType,
    scopes: options.scopes ?? ALL_SCOPES,
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

function featureSetting(
  key: string,
  title: string,
  description: string,
  options: Partial<Omit<AgentSettingDefinition, 'agent' | 'key' | 'nativePath' | 'title' | 'description' | 'valueType' | 'category'>> = {},
): AgentSettingDefinition {
  return setting(`features.${key}`, 'boolean', title, description, {
    ...options,
    category: 'features',
  });
}

export const codexSettingsAdapter: AgentSettingsAdapter = {
  agent: 'codex',
  displayName: 'OpenAI Codex CLI',
  format: 'toml',
  hookEvents: CODEX_HOOK_EVENTS,
  hookScopes: ALL_SCOPES,
  definitions: [
    setting('model', 'string', 'Model', 'Override the default Codex model.', {
      category: 'model',
    }),
    setting('model_provider', 'string', 'Model provider', 'Select a configured model provider.', {
      category: 'model',
    }),
    setting('model_reasoning_effort', 'enum', 'Reasoning effort', 'Reasoning effort for supported models.', {
      allowedValues: ['minimal', 'low', 'medium', 'high'],
      category: 'model',
    }),
    setting('approval_policy', 'enum', 'Approval policy', 'Control when Codex asks for approval before running commands.', {
      allowedValues: ['untrusted', 'on-failure', 'on-request', 'never'],
      category: 'permissions',
      risk: 'security-sensitive',
    }),
    setting('sandbox_mode', 'enum', 'Sandbox mode', 'Control Codex command sandboxing.', {
      allowedValues: ['read-only', 'workspace-write', 'danger-full-access'],
      category: 'permissions',
      risk: 'security-sensitive',
    }),
    setting('web_search', 'enum', 'Web search', 'Top-level Codex web search mode.', {
      allowedValues: ['live', 'cached', 'disabled'],
      category: 'tools',
    }),
    setting('notify', 'array', 'Notifications', 'Program arguments for a notification command run after agent turns.', {
      category: 'notifications',
    }),
    setting('instructions', 'string', 'Instructions', 'Additional user instructions for Codex.', {
      category: 'runtime',
    }),
    setting('model_instructions_file', 'string', 'Model instructions file', 'Path to a model instructions file for Codex.', {
      category: 'runtime',
    }),
    featureSetting('apps', 'Apps', 'Enable ChatGPT Apps/connectors support.', {
      risk: 'risky',
    }),
    featureSetting('codex_hooks', 'Codex hooks', 'Enable lifecycle hooks from hooks.json or inline [hooks].'),
    featureSetting('fast_mode', 'Fast mode', 'Enable Fast mode selection and the service_tier = "fast" path.'),
    featureSetting('memories', 'Memories', 'Enable Codex Memories.'),
    featureSetting('multi_agent', 'Multi-agent', 'Enable subagent collaboration tools.'),
    featureSetting('personality', 'Personality', 'Enable personality selection controls.'),
    featureSetting('shell_snapshot', 'Shell snapshot', 'Snapshot your shell environment to speed up repeated commands.'),
    featureSetting('shell_tool', 'Shell tool', 'Enable the default shell tool.'),
    featureSetting('unified_exec', 'Unified exec', 'Use the unified PTY-backed exec tool.'),
    featureSetting('undo', 'Undo', 'Enable undo via per-turn git ghost snapshots.'),
    featureSetting('web_search', 'Legacy web search feature', 'Deprecated legacy web search feature toggle; prefer top-level web_search.', {
      risk: 'deprecated',
      deprecated: true,
      replacement: 'web_search',
    }),
    featureSetting('web_search_cached', 'Legacy cached web search', 'Deprecated legacy toggle that maps to web_search = "cached" when unset.', {
      risk: 'deprecated',
      deprecated: true,
      replacement: 'web_search',
    }),
    featureSetting('web_search_request', 'Legacy live web search', 'Deprecated legacy toggle that maps to web_search = "live" when unset.', {
      risk: 'deprecated',
      deprecated: true,
      replacement: 'web_search',
    }),
  ],
  getSettingsPath(scope: AgentSettingsScope, projectPath: string): string {
    switch (scope) {
      case 'global':
        return expandTilde('~/.codex/config.toml');
      case 'project':
        return join(projectPath, '.codex', 'config.toml');
      case 'local':
        return join(projectPath, '.codex', 'config.toml');
    }
  },
};
