import { join } from 'path';
import { expandTilde } from '../../../utils/paths.js';
import type { AgentSettingsAdapter, AgentSettingDefinition, AgentSettingsScope } from '../types.js';

const ALL_SCOPES: AgentSettingsScope[] = ['global', 'project', 'local'];

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

/**
 * OpenCode settings adapter.
 *
 * OpenCode (opencode-ai) uses a flat JSON config (`opencode.json`/`opencode.jsonc`).
 * It supports a rich config schema with models, providers, permissions, MCP, agents,
 * tools, themes, and more. There is no built-in hook system.
 *
 * Config locations (in precedence order, lowest to highest):
 *   - Remote (enterprise-provided)
 *   - Global: ~/.config/opencode/opencode.json(c)
 *   - Per-project: <project>/.opencode/opencode.json(c)
 *   - Custom file: OPENCODE_CONFIG env var
 *   - Custom dir: OPENCODE_CONFIG_DIR env var
 *   - Managed settings: ~/.config/opencode/.opencode/managed.json(c)
 *
 * This adapter maps agentinit's three scopes as follows:
 *   - global   → ~/.config/opencode/opencode.json
 *   - project  → <project>/.opencode/opencode.json
 *   - local    → <project>/.opencode/opencode.local.json  (agentinit-managed override)
 *
 * The `model` key stores the model ID in `provider/model` format (e.g. `anthropic/claude-sonnet-4-5`).
 *
 * No hooks: OpenCode does not have a hook system comparable to Claude Code's.
 * Hook subcommands (`agent hook add/list/remove`) will return a descriptive
 * error when used with the opencode agent.
 */
export const opencodeSettingsAdapter: AgentSettingsAdapter = {
  agent: 'opencode',
  displayName: 'OpenCode',
  definitions: [
    setting('model', 'string', 'Model', 'Default model identifier in provider/model format (e.g. anthropic/claude-sonnet-4-5).', {
      defaultScope: 'global',
      category: 'model',
    }),
    setting('default_agent', 'enum', 'Default agent', 'Agent to use when none is specified. Must be a primary agent. Falls back to build.', {
      allowedValues: ['build', 'plan'],
      defaultScope: 'global',
      category: 'agent',
    }),
    setting('autoupdate', 'enum', 'Auto update', 'Control automatic updates: true (auto), false (off), or "notify" (notification only).', {
      allowedValues: ['true', 'false', 'notify'],
      scopes: ['global'],
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('shell', 'string', 'Shell', 'Default shell to use for terminal and bash tool execution.', {
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('share', 'enum', 'Share', 'Control sharing behavior: manual, auto, or disabled.', {
      allowedValues: ['manual', 'auto', 'disabled'],
      defaultScope: 'global',
      category: 'sharing',
    }),
    setting('username', 'string', 'Username', 'Custom username displayed in conversations instead of system username.', {
      defaultScope: 'global',
      category: 'ui',
    }),
    setting('logLevel', 'enum', 'Log level', 'Log verbosity level.', {
      allowedValues: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('snapshot', 'boolean', 'Snapshot tracking', 'Enable/disable filesystem snapshot tracking for undo/redo. Defaults to true.', {
      category: 'runtime',
    }),
    setting('permission.*', 'enum', 'Default permission', 'Default permission rule for all tools: allow, ask, or deny.', {
      nativePath: ['permission', 'default'],
      defaultScope: 'global',
      category: 'permissions',
      risk: 'security-sensitive',
      allowedValues: ['allow', 'ask', 'deny'],
    }),
    setting('permission.bash', 'enum', 'Bash permission', 'Permission rule for shell command execution.', {
      category: 'permissions',
      risk: 'security-sensitive',
      allowedValues: ['allow', 'ask', 'deny'],
    }),
    setting('permission.read', 'enum', 'Read permission', 'Permission rule for reading files outside the workspace.', {
      category: 'permissions',
      allowedValues: ['allow', 'ask', 'deny'],
    }),
    setting('permission.edit', 'enum', 'Edit permission', 'Permission rule for editing/writing files.', {
      category: 'permissions',
      risk: 'risky',
      allowedValues: ['allow', 'ask', 'deny'],
    }),
    setting('permission.webfetch', 'enum', 'Web fetch permission', 'Permission rule for fetching external URLs.', {
      category: 'permissions',
      allowedValues: ['allow', 'ask', 'deny'],
    }),
    setting('permission.task', 'enum', 'Task permission', 'Permission rule for spawning subagent tasks.', {
      category: 'permissions',
      allowedValues: ['allow', 'ask', 'deny'],
    }),
    setting('permission.websearch', 'enum', 'Web search permission', 'Permission rule for web search operations.', {
      category: 'permissions',
      allowedValues: ['allow', 'ask', 'deny'],
    }),
    setting('compaction.auto', 'boolean', 'Auto compaction', 'Enable automatic context compaction when context is full. Defaults to true.', {
      defaultScope: 'global',
      category: 'compaction',
    }),
    setting('tool_output.max_lines', 'number', 'Tool output max lines', 'Maximum lines of tool output before truncation. Defaults to 2000.', {
      defaultScope: 'global',
      category: 'output',
    }),
    setting('tool_output.max_bytes', 'number', 'Tool output max bytes', 'Maximum bytes of tool output before truncation. Defaults to 51200.', {
      defaultScope: 'global',
      category: 'output',
    }),
   ],
  getSettingsPath(scope: AgentSettingsScope, projectPath: string): string {
    switch (scope) {
      case 'global':
        return expandTilde('~/.config/opencode/opencode.json');
      case 'project':
        return join(projectPath, '.opencode', 'opencode.json');
      case 'local':
        return join(projectPath, '.opencode', 'opencode.local.json');
    }
  },
};
