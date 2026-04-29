import { join } from 'path';
import { expandTilde } from '../../../utils/paths.js';
import type { AgentHookEvent, AgentSettingsAdapter, AgentSettingDefinition, AgentSettingsScope } from '../types.js';

const ALL_SCOPES: AgentSettingsScope[] = ['global', 'project', 'local'];
const PERSONAL_SCOPES: AgentSettingsScope[] = ['global', 'local'];
const GLOBAL_CONFIG_SCOPES: AgentSettingsScope[] = ['global'];
const CLAUDE_HOOK_EVENTS: AgentHookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'PermissionRequest',
  'Stop',
  'SessionStart',
  'SessionEnd',
];

const THEME_VALUES = ['auto', 'dark', 'light', 'light-daltonized', 'dark-daltonized', 'light-ansi', 'dark-ansi'];
const NOTIFICATION_CHANNELS = ['auto', 'iterm2', 'iterm2_with_bell', 'terminal_bell', 'kitty', 'ghostty', 'notifications_disabled'];
const TEAMMATE_MODES = ['auto', 'tmux', 'in-process'];

function setting(
  key: string,
  valueType: AgentSettingDefinition['valueType'],
  title: string,
  description: string,
  options: Partial<Omit<AgentSettingDefinition, 'agent' | 'key' | 'nativePath' | 'title' | 'description' | 'valueType'>> = {},
): AgentSettingDefinition {
  const definition: AgentSettingDefinition = {
    agent: 'claude',
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
  if (options.store) {
    definition.store = options.store;
  }
  if (options.deprecated !== undefined) {
    definition.deprecated = options.deprecated;
  }
  if (options.replacement) {
    definition.replacement = options.replacement;
  }

  return definition;
}

function globalConfigSetting(
  key: string,
  valueType: AgentSettingDefinition['valueType'],
  title: string,
  description: string,
  options: Partial<Omit<AgentSettingDefinition, 'agent' | 'key' | 'nativePath' | 'title' | 'description' | 'valueType' | 'scopes' | 'defaultScope' | 'store'>> = {},
): AgentSettingDefinition {
  return setting(key, valueType, title, description, {
    ...options,
    scopes: GLOBAL_CONFIG_SCOPES,
    defaultScope: 'global',
    store: 'globalConfig',
  });
}

export const claudeSettingsAdapter: AgentSettingsAdapter = {
  agent: 'claude',
  displayName: 'Claude Code',
  hookEvents: CLAUDE_HOOK_EVENTS,
  hookScopes: ALL_SCOPES,
  definitions: [
    globalConfigSetting('theme', 'enum', 'Theme', 'Claude Code UI color theme.', {
      allowedValues: THEME_VALUES,
      category: 'ui',
    }),
    globalConfigSetting('editorMode', 'enum', 'Editor mode', 'Keyboard editing mode.', {
      allowedValues: ['normal', 'vim'],
      category: 'ui',
    }),
    globalConfigSetting('verbose', 'boolean', 'Verbose output', 'Show detailed debug output.', {
      category: 'runtime',
    }),
    globalConfigSetting('preferredNotifChannel', 'enum', 'Notification channel', 'Preferred local notification delivery method.', {
      allowedValues: NOTIFICATION_CHANNELS,
      category: 'notifications',
    }),
    globalConfigSetting('autoCompactEnabled', 'boolean', 'Auto compact', 'Auto-compact conversation context when it gets full.', {
      category: 'runtime',
    }),
    globalConfigSetting('fileCheckpointingEnabled', 'boolean', 'File checkpointing', 'Enable code rewind checkpoint snapshots.', {
      category: 'runtime',
    }),
    globalConfigSetting('showTurnDuration', 'boolean', 'Turn duration', 'Show how long Claude spent on each turn.', {
      category: 'ui',
    }),
    globalConfigSetting('terminalProgressBarEnabled', 'boolean', 'Terminal progress bar', 'Show terminal progress in supported terminals.', {
      category: 'ui',
    }),
    globalConfigSetting('todoFeatureEnabled', 'boolean', 'Todo feature', 'Enable Claude todo and task tracking.', {
      category: 'ui',
    }),
    globalConfigSetting('teammateMode', 'enum', 'Teammate mode', 'Control how Claude spawns teammate agents.', {
      allowedValues: TEAMMATE_MODES,
      category: 'agents',
    }),
    globalConfigSetting('autoConnectIde', 'boolean', 'Auto-connect IDE', 'Auto-connect to an IDE from external terminals.', {
      category: 'ide',
    }),
    globalConfigSetting('autoInstallIdeExtension', 'boolean', 'Auto-install IDE extension', 'Auto-install the IDE extension when supported.', {
      category: 'ide',
    }),
    globalConfigSetting('diffTool', 'enum', 'Diff tool', 'Choose where diffs are shown.', {
      allowedValues: ['terminal', 'auto'],
      category: 'ide',
    }),
    globalConfigSetting('respectGitignore', 'boolean', 'Respect gitignore', 'Hide gitignored files from Claude file pickers.', {
      category: 'ui',
    }),
    globalConfigSetting('copyFullResponse', 'boolean', 'Copy full response', 'Copy full responses without the copy picker flow.', {
      category: 'ui',
    }),
    globalConfigSetting('copyOnSelect', 'boolean', 'Copy on select', 'Copy selected text automatically in fullscreen mode.', {
      category: 'ui',
    }),
    globalConfigSetting('remoteControlAtStartup', 'boolean', 'Remote control at startup', 'Enable Remote Control for new Claude sessions. Unset to restore Claude defaults.', {
      category: 'remote-control',
    }),
    globalConfigSetting('taskCompleteNotifEnabled', 'boolean', 'Task complete push notifications', 'Push when Claude finishes and becomes idle.', {
      category: 'notifications',
    }),
    globalConfigSetting('inputNeededNotifEnabled', 'boolean', 'Input needed push notifications', 'Push when Claude needs user input.', {
      category: 'notifications',
    }),
    globalConfigSetting('agentPushNotifEnabled', 'boolean', 'Agent push notifications', 'Allow Claude to decide when to send push notifications.', {
      category: 'notifications',
    }),
    globalConfigSetting('showStatusInTerminalTab', 'boolean', 'Terminal tab status', 'Show Claude status in the terminal tab status area.', {
      category: 'ui',
    }),
    globalConfigSetting('prStatusFooterEnabled', 'boolean', 'PR status footer', 'Show pull request status in Claude footer.', {
      category: 'git',
    }),
    globalConfigSetting('claudeInChromeDefaultEnabled', 'boolean', 'Claude in Chrome default', 'Enable Claude in Chrome by default.', {
      category: 'browser',
    }),
    globalConfigSetting('teammateDefaultModel', 'string', 'Teammate default model', 'Default model for spawned teammate agents.', {
      category: 'agents',
    }),
    setting('model', 'string', 'Model', 'Override the default Claude Code model.', {
      defaultScope: 'global',
      category: 'model',
    }),
    setting('agent', 'string', 'Agent', 'Run the main thread as a named Claude subagent.', {
      category: 'model',
    }),
    setting('env', 'object', 'Environment', 'Environment variables applied to every Claude Code session.', {
      category: 'runtime',
    }),
    setting('permissions.allow', 'array', 'Allowed permissions', 'Permission rules to allow.', {
      category: 'permissions',
    }),
    setting('permissions.deny', 'array', 'Denied permissions', 'Permission rules to deny.', {
      category: 'permissions',
    }),
    setting('permissions.ask', 'array', 'Ask permissions', 'Permission rules that require confirmation.', {
      category: 'permissions',
    }),
    setting('permissions.defaultMode', 'enum', 'Default permission mode', 'Default permission mode when opening Claude Code.', {
      allowedValues: ['default', 'acceptEdits', 'plan', 'dontAsk'],
      category: 'permissions',
      risk: 'security-sensitive',
    }),
    setting('permissions.disableBypassPermissionsMode', 'enum', 'Disable bypass permissions mode', 'Disable Claude bypass-permissions mode.', {
      allowedValues: ['disable'],
      category: 'permissions',
      risk: 'security-sensitive',
    }),
    setting('permissions.additionalDirectories', 'array', 'Additional directories', 'Additional working directories for file access.', {
      category: 'permissions',
    }),
    setting('worktree.symlinkDirectories', 'array', 'Worktree symlink directories', 'Directories to symlink into Claude Code worktrees.', {
      category: 'worktree',
    }),
    setting('worktree.sparsePaths', 'array', 'Worktree sparse paths', 'Paths to check out via sparse checkout in Claude Code worktrees.', {
      category: 'worktree',
    }),
    setting('plansDirectory', 'string', 'Plans directory', 'Directory where Claude Code stores plan files.', {
      category: 'runtime',
    }),
    setting('autoMemoryDirectory', 'string', 'Auto memory directory', 'Custom directory for Claude Code auto memory storage.', {
      scopes: PERSONAL_SCOPES,
      defaultScope: 'global',
      category: 'memory',
    }),
    setting('autoMemoryEnabled', 'boolean', 'Auto memory', 'Enable automatic memory capture.', {
      defaultScope: 'global',
      category: 'memory',
    }),
    setting('autoDreamEnabled', 'boolean', 'Auto dream', 'Enable background memory consolidation.', {
      defaultScope: 'global',
      category: 'memory',
    }),
    setting('alwaysThinkingEnabled', 'boolean', 'Always thinking', 'Enable extended thinking by default for Claude Code sessions.', {
      defaultScope: 'global',
      category: 'model',
    }),
    setting('effortLevel', 'enum', 'Effort level', 'Persist Claude Code effort level across sessions.', {
      allowedValues: ['low', 'medium', 'high', 'xhigh'],
      defaultScope: 'global',
      category: 'model',
    }),
    setting('prefersReducedMotion', 'boolean', 'Reduced motion', 'Reduce or disable Claude Code UI animations.', {
      defaultScope: 'global',
      category: 'ui',
    }),
    setting('attribution', 'object', 'Attribution', 'Customize Claude Code git commit and pull request attribution.', {
      defaultScope: 'global',
      category: 'git',
    }),
    setting('includeGitInstructions', 'boolean', 'Git instructions', 'Include built-in git workflow instructions in Claude Code context.', {
      defaultScope: 'global',
      category: 'git',
    }),
    setting('cleanupPeriodDays', 'number', 'Cleanup period', 'Delete session files older than this many days at startup.', {
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('showThinkingSummaries', 'boolean', 'Thinking summaries', 'Show extended thinking summaries in interactive sessions.', {
      defaultScope: 'global',
      category: 'ui',
    }),
    setting('spinnerTipsEnabled', 'boolean', 'Spinner tips', 'Show or hide tips while Claude Code is working.', {
      defaultScope: 'global',
      category: 'ui',
    }),
    setting('autoUpdatesChannel', 'enum', 'Auto updates channel', 'Claude Code release channel for automatic updates.', {
      allowedValues: ['stable', 'latest'],
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('language', 'string', 'Language', 'Preferred language for Claude responses and voice dictation.', {
      defaultScope: 'global',
      category: 'ui',
    }),
    setting('outputStyle', 'string', 'Output style', 'Claude response output style.', {
      defaultScope: 'global',
      category: 'ui',
    }),
    setting('defaultView', 'enum', 'Default view', 'Default Claude view. Unset to restore Claude defaults.', {
      allowedValues: ['transcript', 'chat'],
      category: 'ui',
    }),
    setting('useAutoModeDuringPlan', 'boolean', 'Use auto mode during plan', 'Allow auto permission mode during plan mode.', {
      scopes: PERSONAL_SCOPES,
      defaultScope: 'global',
      category: 'permissions',
      risk: 'security-sensitive',
    }),
    setting('includeCoAuthoredBy', 'boolean', 'Include co-authored-by', 'Deprecated Claude Code attribution toggle.', {
      defaultScope: 'global',
      category: 'git',
      risk: 'deprecated',
      deprecated: true,
      replacement: 'attribution',
    }),
    setting('enableAllProjectMcpServers', 'boolean', 'Enable all project MCP servers', 'Automatically approve project .mcp.json servers.', {
      category: 'mcp',
      risk: 'security-sensitive',
    }),
    setting('enabledMcpjsonServers', 'array', 'Enabled MCP JSON servers', 'Specific project .mcp.json servers to approve.', {
      category: 'mcp',
    }),
    setting('disabledMcpjsonServers', 'array', 'Disabled MCP JSON servers', 'Specific project .mcp.json servers to reject.', {
      category: 'mcp',
    }),
    setting('skipDangerousModePermissionPrompt', 'boolean', 'Skip dangerous mode prompt', 'Skip confirmation before bypass permissions mode.', {
      scopes: PERSONAL_SCOPES,
      defaultScope: 'global',
      category: 'permissions',
      risk: 'security-sensitive',
    }),
  ],
  getSettingsPath(scope: AgentSettingsScope, projectPath: string, definition?: AgentSettingDefinition): string {
    if (definition?.store === 'globalConfig') {
      return expandTilde('~/.claude.json');
    }

    switch (scope) {
      case 'global':
        return expandTilde('~/.claude/settings.json');
      case 'project':
        return join(projectPath, '.claude', 'settings.json');
      case 'local':
        return join(projectPath, '.claude', 'settings.local.json');
    }
  },
};
