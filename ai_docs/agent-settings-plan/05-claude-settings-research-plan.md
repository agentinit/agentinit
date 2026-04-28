# Claude Settings Research Plan

## Goal

Turn the Claude-specific research from:

- `/Users/ivan/git/ai_agents/claude/claude_code_research_src`
- `/Users/ivan/git/ai_agents/claude/claude-code-templates`

into a concrete AgentInit implementation plan for:

```bash
agentinit agent set claude <key> <value>
agentinit agent get claude [key]
agentinit agent unset claude <key>
agentinit agent list claude
agentinit agent schema claude
```

This document is the Claude-specific bridge between research and implementation.

## Executive Summary

Claude has two configuration layers that AgentInit must model separately:

1. Native structured settings in:
   - `~/.claude/settings.json`
   - `.claude/settings.json`
   - `.claude/settings.local.json`
2. Separate global config in `utils/config.ts` for values like notification channel.

Claude also has a powerful hook system with typed events, typed hook commands, and structured hook output. That means AgentInit should not expose raw hook JSON as the primary public API. It should expose stable canonical keys plus preset-backed values, then expand those into native settings.

The template repo is useful as a preset catalog, not as the schema authority. The source of truth is Claude’s settings and hook schema in `claude_code_research_src`.

## Native Claude Settings Model

### File hierarchy

Claude reads settings from these user-facing files:

- `~/.claude/settings.json`
- `.claude/settings.json`
- `.claude/settings.local.json`

Additional non-user-edit surfaces also exist:

- `--settings <file-or-json>`
- remote managed cache
- MDM / registry / plist policy
- managed settings files

### Effective precedence

Resolved precedence is:

```txt
plugin base
-> userSettings
-> projectSettings
-> localSettings
-> flagSettings
-> policySettings
```

Policy precedence itself is:

```txt
remote managed cache
-> MDM/HKLM/plist
-> managed-settings.json + managed-settings.d/*.json
-> HKCU
```

### Merge behavior

AgentInit must respect Claude’s real merge behavior:

- arrays merge across sources by concat + dedupe on read
- objects deep-merge
- policy layers are first-source-wins, not merged across policy origins
- single-file writes replace arrays in that file
- `undefined` removes keys during updates
- policy and flag settings are not file-editable

### Important implication

`agentinit agent set claude ...` should operate only on editable user/project/local settings files. It should not pretend to manage policy or session-only flag settings.

## Claude Settings Inventory

The broad native settings groups discovered in Claude’s schema are:

### Stable user-facing groups

- auth/bootstrap
- env/basic UX
- attribution/UI
- model/agent/runtime
- permissions
- hooks/status
- MCP/plugins/marketplaces
- sandbox
- worktree/remote/memory

### Feature-gated or risky groups

- voice
- assistant mode
- auto mode internals
- enterprise/managed restrictions
- deep-link and sleep settings
- channel/plugin policy controls

### Recommended stable AgentInit keys

These are the Claude keys AgentInit should model first. This tier should stay
limited to documented, user-editable `settings.json` keys that are useful for
normal user/project configuration.

- `model`
- `agent`
- `env`
- `permissions.allow`
- `permissions.deny`
- `permissions.ask`
- `permissions.defaultMode`
- `permissions.additionalDirectories`
- `worktree.symlinkDirectories`
- `worktree.sparsePaths`
- `plansDirectory`
- `autoMemoryDirectory`
- `alwaysThinkingEnabled`
- `effortLevel`
- `prefersReducedMotion`
- `attribution`
- `includeGitInstructions`
- `cleanupPeriodDays`
- `showThinkingSummaries`
- `spinnerTipsEnabled`
- `autoUpdatesChannel`

### Excluded from the Phase 1 public registry

These settings are real, but should not be exposed as raw generic writes:

- `hooks`: command execution must be preset-backed.
  Custom command hooks are supported through typed `agent hook add/list/remove`
  operations, not raw generic JSON writes.
- `statusLine`: command execution must be preset-backed.
- `sandbox`: approval/sandbox changes need a safer typed surface.
- `enabledPlugins`: managed by `agentinit plugins`.
- `extraKnownMarketplaces`: managed by `agentinit plugins`.

### MCP-specific keys

These are documented settings, but they should be exposed as an MCP-specific
group or a later phase rather than mixed into the first stable Claude surface:

- `enableAllProjectMcpServers`
- `enabledMcpjsonServers`
- `disabledMcpjsonServers`

### User/local-only or risky keys

These are real settings, but should not be installed as shared project defaults
without explicit user intent:

- `skipDangerousModePermissionPrompt`
- `autoMode`
- `useAutoModeDuringPlan`
- `disableAutoMode`

### Deprecated compatibility keys

AgentInit can support these as aliases for existing users, but new presets
should prefer the replacement setting:

- `includeCoAuthoredBy` -> prefer `attribution.commit` and `attribution.pr`

### Research-only or unverified keys

Do not expose these in the stable public surface until they have a current
public docs or schema reference:

- `pluginConfigs`
- `autoMemoryEnabled`
- `claudeMdExcludes`
- `strictPluginOnlyCustomization`
- `skipAutoPermissionPrompt`

### Keys to avoid initially

Do not include these in the first AgentInit public surface unless we explicitly choose to support enterprise/admin-only behavior:

- `allowManaged*`
- `strictPluginOnlyCustomization`
- `strictKnownMarketplaces`
- `blockedMarketplaces`
- `pluginTrustMessage`
- `channels*`
- `forceLogin*`
- `availableModels`
- `modelOverrides`
- `autoMode.*`
- feature-gated assistant / voice / sleep controls

## Hook System Findings

Claude’s hook model is strong enough that AgentInit should use presets rather than inventing a second automation framework.

### Persisted hook types

Supported persisted hook command types:

- `command`
- `prompt`
- `agent`
- `http`

### Hook matcher model

Hooks are grouped by event, then by matchers:

```ts
Partial<Record<HookEvent, HookMatcher[]>>
```

Where:

- `HookMatcher` = `{ matcher?: string; hooks: HookCommand[] }`
- `matcher` can be exact, pipe-separated exact match, regex, `*`, or empty

### High-value events

AgentInit should care about these first:

- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`
- `Notification`
- `PermissionRequest`
- `Stop`
- `SessionStart`
- `SessionEnd`

Claude supports many more, but those are sufficient for the first public API.

### Relevant hook output behavior

Hook outputs can:

- continue or block execution
- suppress output
- provide a stop reason
- provide a system message
- mutate tool input for `PreToolUse`
- provide permission decisions for `PermissionRequest`
- inject additional context for post-tool and notification flows

### Key product implication

AgentInit should not expose “raw hook object editing” as the default UX. It should expose canonical keys like:

- `hooks.pre-tool-use`
- `hooks.post-tool-use`
- `notifications.turn-end`
- `notifications.needs-input`

and expand those into validated hook definitions internally.

## Notification Findings

Claude notifications are split across two systems:

1. A notification transport preference:
   - `preferredNotifChannel`
2. Hooks that decide what to do when notification events occur:
   - `hooks.Notification`
   - `hooks.Stop`

### Native notification transport values

Known global transport values:

- `auto`
- `iterm2`
- `iterm2_with_bell`
- `terminal_bell`
- `kitty`
- `ghostty`
- `notifications_disabled`

Legacy `customNotifyCommand` exists but is deprecated in favor of the `Notification` hook.

### Notification event inputs

The hook input includes:

- `message`
- `title?`
- `notification_type`

Observed notification types include:

- `permission_prompt`
- `idle_prompt`
- `auth_success`
- `elicitation_dialog`
- `elicitation_complete`
- `elicitation_response`
- `worker_permission_prompt`
- `computer_use_enter`
- `computer_use_exit`

### Product implication

The website example:

```txt
turn on notifications for claude when it ends its turn
```

should not map to only `preferredNotifChannel`. It needs both:

- transport selection
- a hook preset for `Stop` or `Notification`

## Permission Findings

The permissions model is a first-class user-facing configuration area and should be modeled directly.

Useful stable settings:

- `permissions.allow`
- `permissions.deny`
- `permissions.ask`
- `permissions.defaultMode`
- `permissions.additionalDirectories`

Risk controls:

- `permissions.disableBypassPermissionsMode`
- `disableAllHooks`
- `allowManagedHooksOnly`
- `allowManagedPermissionRulesOnly`

### Critical behavior notes

- `dontAsk` effectively converts final `ask` to `deny`
- `bypassPermissions` does not override all safety checks
- `acceptEdits` still respects safety checks and path restrictions
- auto mode strips dangerous allow rules
- remote/CCR only honors a subset of permission modes

### Product implication

AgentInit should expose safe permission presets, not only raw lists.

Recommended preset family:

- `permissions.profile read-only`
- `permissions.profile development`

Then later:

- additive `permissions.allow --json`
- additive `permissions.deny --json`

## Template Repo Findings

The template repo is valuable mostly for identifying reusable presets.

### Strong preset candidates

- permission profiles
- runtime/bash timeout presets
- notification hook presets
- security hook presets
- quality gate hook presets
- MCP allowlist/blocklist/timeout presets
- statusline presets

### Template patterns worth carrying over

- layered `CLAUDE.md`
- path-scoped `.claude/rules/*.md`
- preset-driven hook installation
- launch profiles
- build/review helper agents

### What not to copy blindly

Do not adopt the full TypeScript template settings as AgentInit defaults. They are too aggressive:

- lint on save
- tests after changes
- audits and checks on edit paths

Those should remain opt-in presets.

## Proposed AgentInit Surface For Claude

### Direct schema-backed keys

These can map almost 1:1:

- `model`
- `agent`
- `env`
- `permissions.defaultMode`
- `permissions.allow`
- `permissions.deny`
- `permissions.ask`
- `permissions.additionalDirectories`
- `sandbox`
- `enabledPlugins`
- `extraKnownMarketplaces`
- `plansDirectory`
- `autoMemoryDirectory`
- `alwaysThinkingEnabled`
- `effortLevel`
- `prefersReducedMotion`
- `attribution`
- `includeGitInstructions`
- `cleanupPeriodDays`
- `showThinkingSummaries`
- `spinnerTipsEnabled`
- `autoUpdatesChannel`

### Canonical convenience keys

These should be first-class AgentInit keys even if they expand into multiple native fields:

- `notifications.channel`
- `notifications.turn-end`
- `notifications.needs-input`
- `hooks.pre-tool-use`
- `hooks.post-tool-use`
- `hooks.permission-request`
- `permissions.profile`
- `runtime.bash.defaultTimeoutMs`
- `runtime.bash.maxTimeoutMs`
- `runtime.bash.maxOutputLength`
- `runtime.maintainWorkingDir`
- `cleanup.days`
- `git.attribution`
- `git.includeCoAuthoredBy` (deprecated compatibility alias)
- `statusline.preset`
- `mcp.timeoutMs`
- `mcp.toolTimeoutMs`
- `mcp.defaults.profile`

## Recommended Preset Set

### Notification presets

- `turn-end`
- `needs-input`
- `worker-permission-prompt`

### Hook presets

- `danger-command-guard`
- `secret-scanner`
- `plan-gate`
- `tdd-gate`
- `lint-on-save`
- `run-tests-after-changes`
- `tool-audit`

### Permission presets

- `read-only`
- `development`
- `safe-editing`

### MCP presets

- `common`
- `enable-specific-servers`
- `disable-risky-servers`
- `timeouts-standard`

### Statusline presets

- `project-info`
- `vercel-deployment-monitor`

## Suggested CLI Mapping

### Natural mapping examples

```bash
agentinit agent set claude notifications.channel auto --global
agentinit agent set claude notifications.turn-end on --global
agentinit agent set claude notifications.needs-input on --global
agentinit agent set claude hooks.pre-tool-use danger-command-guard --global
agentinit agent set claude hooks.post-tool-use lint-on-save --project
agentinit agent set claude permissions.profile development --project
agentinit agent set claude permissions.defaultMode acceptEdits --project
agentinit agent set claude statusline.preset project-info --project
agentinit agent set claude mcp.defaults.profile common --project
```

### Website example mapping

User input:

```txt
I want to turn on notifications for Claude when it ends its turn and add a prehook for dangerous commands.
```

Action plan:

```json
[
  {
    "op": "set",
    "agent": "claude",
    "key": "notifications.turn-end",
    "value": "on",
    "scope": "global"
  },
  {
    "op": "set",
    "agent": "claude",
    "key": "hooks.pre-tool-use",
    "value": "danger-command-guard",
    "scope": "global"
  }
]
```

Rendered commands:

```bash
agentinit agent set claude notifications.turn-end on --global
agentinit agent set claude hooks.pre-tool-use danger-command-guard --global
```

## Implementation Plan

### Phase 1

Implement schema-backed Claude support for:

- `model`
- `env`
- `permissions.defaultMode`
- `permissions.allow`
- `permissions.deny`
- `permissions.ask`
- `sandbox`
- `enabledPlugins`
- `extraKnownMarketplaces`
- `alwaysThinkingEnabled`
- `effortLevel`
- `prefersReducedMotion`
- `statusLine`

### Phase 2

Add preset-backed convenience keys for:

- `permissions.profile`
- `notifications.channel`
- `notifications.turn-end`
- `notifications.needs-input`
- `hooks.pre-tool-use`
- `hooks.post-tool-use`
- `statusline.preset`
- `git.attribution`

### Phase 3

Add richer areas:

- `autoMemoryDirectory`
- `plansDirectory`
- worktree settings
- MCP approval settings (`enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`)
- MCP timeout presets

### Phase 4

Optional advanced support:

- raw hook JSON mode
- enterprise/managed policy awareness
- assistant/voice/feature-gated keys

## Validation Rules

AgentInit should enforce:

- registry-backed keys only by default
- typed parsing for primitive values
- preset validation for hook/security/statusline settings
- scope validation (`global`, `project`, `local` if we choose to expose local later)
- no writes to policy layers
- no raw shell generation from website/chat flows

## Open Questions

- Whether `agentinit agent set claude notifications.turn-end on` should implicitly set `notifications.channel auto` if no channel exists yet.
- Whether AgentInit should expose `local` scope explicitly or keep public UX to `--project` and `--global` only.
- Whether `preferredNotifChannel` should be included in `agent schema claude` even though it comes from Claude’s global config path, not `SettingsSchema`.
- Whether Phase 2 should expose `statusLine` only through preset-backed support.

## Recommended Next Deliverable

Create a machine-readable Claude mapping table for AgentInit with columns:

- canonical key
- native file path kind
- native JSON path
- scope support
- value type
- preset names if applicable
- merge strategy
- risk level
- source reference

That table should become the first draft of `agentinit agent schema claude`.
