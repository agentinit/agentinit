import { join } from 'path';
import { expandTilde } from '../../../utils/paths.js';
import type { AgentSettingsAdapter, AgentSettingDefinition, AgentSettingsScope } from '../types.js';

const ALL_SCOPES: AgentSettingsScope[] = ['global', 'project', 'local'];
const PERSONAL_SCOPES: AgentSettingsScope[] = ['global', 'local'];

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
  if (options.deprecated !== undefined) {
    definition.deprecated = options.deprecated;
  }
  if (options.replacement) {
    definition.replacement = options.replacement;
  }

  return definition;
}

export const claudeSettingsAdapter: AgentSettingsAdapter = {
  agent: 'claude',
  displayName: 'Claude Code',
  definitions: [
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
      allowedValues: ['default', 'acceptEdits', 'plan'],
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
  getSettingsPath(scope: AgentSettingsScope, projectPath: string): string {
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
