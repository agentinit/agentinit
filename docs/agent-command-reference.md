# `agentinit agent` Reference

`agentinit agent` manages registry-backed native agent settings. Supported agents: `claude` (Claude Code) and `opencode` (OpenCode).

When you omit `--global`, `--project`, and `--local`, `agentinit agent` defaults to `global`. You can override that default with `AGENTINIT_AGENT_DEFAULT_SCOPE=global|project|local` or persist a user preference with `agentinit config agent-settings scope <scope>`.

## Command Surface

```bash
# List agents and settings
agentinit agent list
agentinit agent list opencode
agentinit agent schema opencode [--json]

# Read settings
agentinit agent get opencode [key] [--global|--project|--local] [--json]
agentinit agent set opencode <key> <value> [--global|--project|--local] [--value-json] [--json] [--dry-run]
agentinit agent unset opencode <key> [--global|--project|--local] [--json] [--dry-run]

# Claude hooks (Claude Code only)
agentinit agent hook add claude <event> --command "<shell command>" [--matcher <matcher>] [--name <name>] [--global|--project|--local] [--json] [--dry-run]
agentinit agent hook list claude [event] [--global|--project|--local] [--json]
agentinit agent hook remove claude <event> <command-or-name> [--matcher <matcher>] [--global|--project|--local] [--json] [--dry-run]
```

> **Note:** OpenCode does not have a hook system. Hook subcommands are only available for `claude`.

---

## Scope Resolution

| Scope | Claude Code | OpenCode |
|---|---|---|
| `global` | `~/.claude/settings.json` | `~/.config/opencode/opencode.json` |
| `project` | `<project>/.claude/settings.json` | `<project>/.opencode/opencode.json` |
| `local` | `<project>/.claude/settings.local.json` | `<project>/.opencode/opencode.local.json` |

---

## Supported OpenCode Setting Keys

### Model
- `model` — default model in `provider/model` format (e.g. `anthropic/claude-sonnet-4-5`)
- `small_model` — small model for lightweight tasks

### Agent
- `default_agent` — default agent: `build` or `plan`

### Permissions
- `permission.*` — default permission for all tools: `allow`, `ask`, or `deny`
- `permission.bash` — shell command execution
- `permission.read` — reading files outside workspace
- `permission.edit` — editing/writing files
- `permission.webfetch` — fetching external URLs
- `permission.task` — spawning subagent tasks
- `permission.websearch` — web search operations

### Compaction
- `compaction.auto` — enable automatic context compaction (default: `true`)

### Output
- `tool_output.max_lines` — max lines before truncation (default: 2000)
- `tool_output.max_bytes` — max bytes before truncation (default: 51200)

### Runtime
- `autoupdate` — auto-update or `notify`
- `shell` — default shell for terminal
- `logLevel` — log verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR`
- `snapshot` — enable/disable undo/redo tracking

### UI / Sharing
- `username` — custom display name
- `share` — sharing mode: `manual`, `auto`, or `disabled`

---

## Supported Claude Setting Keys

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
- `includeCoAuthoredBy`
- `enableAllProjectMcpServers`
- `enabledMcpjsonServers`
- `disabledMcpjsonServers`
- `skipDangerousModePermissionPrompt`

---

## Hook Events (Claude Code only)

- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`
- `Notification`
- `PermissionRequest`
- `Stop`
- `SessionStart`
- `SessionEnd`

Accepted aliases include `before-tool-use`, `after-tool-use`, `post-tool-use-failure`, `permission-request`, `session-start`, and `session-end`.

---

## Examples

### OpenCode

Inspect supported agents and settings:

```bash
agentinit agent list
agentinit agent list opencode
agentinit agent schema opencode
agentinit agent schema opencode --json
```

Read and set settings:

```bash
agentinit agent get opencode
agentinit agent get opencode --project
agentinit agent get opencode model
agentinit agent get opencode model --json
agentinit agent set opencode model "anthropic/claude-sonnet-4-5"
agentinit agent set opencode default_agent plan --project
agentinit agent set opencode snapshot false
agentinit agent set opencode permission.edit deny --project
agentinit agent set opencode tool_output.max_lines 5000
agentinit agent set opencode autoupdate notify
agentinit agent set opencode share manual
agentinit agent unset opencode permission.bash --project
```

### Claude Code

Read settings in human or JSON form:

```bash
agentinit agent get claude
agentinit agent get claude --project
agentinit agent get claude model
agentinit agent get claude model --json
agentinit agent get claude env --project --json
agentinit agent get claude permissions.allow --project --json
```

Set string values:

```bash
agentinit agent set claude model sonnet
agentinit agent set claude agent reviewer --project
agentinit agent set claude plansDirectory .claude/plans --project
```

Set booleans:

```bash
agentinit agent set claude alwaysThinkingEnabled on
agentinit agent set claude prefersReducedMotion true
agentinit agent set claude includeGitInstructions false
agentinit agent set claude showThinkingSummaries yes
agentinit agent set claude spinnerTipsEnabled off
agentinit agent set claude enableAllProjectMcpServers true --project
agentinit agent set claude skipDangerousModePermissionPrompt true
```

Set enums:

```bash
agentinit agent set claude effortLevel high
agentinit agent set claude permissions.defaultMode acceptEdits --project
agentinit agent set claude autoUpdatesChannel stable
```

Set numbers:

```bash
agentinit agent set claude cleanupPeriodDays 30
```

Set arrays:

```bash
agentinit agent set claude permissions.allow 'Bash(npm test *)' --project
agentinit agent set claude permissions.deny 'Bash(rm -rf *)' --project
agentinit agent set claude permissions.ask 'Bash(git push *)' --project
agentinit agent set claude permissions.additionalDirectories '["../shared","../docs"]' --project --value-json
agentinit agent set claude worktree.symlinkDirectories '["node_modules",".env.local"]' --project --value-json
agentinit agent set claude worktree.sparsePaths '["src","tests","package.json"]' --project --value-json
agentinit agent set claude enabledMcpjsonServers '["github","playwright"]' --project --value-json
agentinit agent set claude disabledMcpjsonServers '["dangerous-server"]' --project --value-json
```

Set objects:

```bash
agentinit agent set claude env '{"AGENTINIT_TEST":"1"}' --value-json
agentinit agent set claude env '{"NODE_ENV":"test","CI":"1"}' --project --value-json
agentinit agent set claude attribution '{"coAuthoredBy":"AgentInit"}' --value-json
```

Add and inspect Claude hooks:

```bash
agentinit agent hook add claude after-tool-use --command "npm run lint"
agentinit agent hook add claude after-tool-use --command "npm run lint" --matcher "Edit|Write" --name lint-after-edit
agentinit agent hook add claude after-tool-use --command "npm test" --matcher "Edit|Write" --name test-after-edit --project
agentinit agent hook add claude pre-tool-use --command "echo about to run tool" --matcher "Bash" --project
agentinit agent hook list claude
agentinit agent hook list claude --project
agentinit agent hook list claude post-tool-use
agentinit agent hook list claude post-tool-use --json
agentinit agent hook remove claude post-tool-use lint-after-edit --matcher "Edit|Write"
agentinit agent hook remove claude post-tool-use test-after-edit --matcher "Edit|Write" --project
agentinit agent hook remove claude post-tool-use "npm run lint"
```

Preview writes without changing files:

```bash
agentinit agent set claude effortLevel high --dry-run
agentinit agent unset claude includeGitInstructions --dry-run
agentinit agent hook add claude after-tool-use --command "npm test" --project --dry-run
```

Machine-readable output:

```bash
agentinit agent set claude model sonnet --json
agentinit agent get claude model --json
agentinit agent unset claude effortLevel --json
agentinit agent hook list claude post-tool-use --project --json
```

Remove settings:

```bash
agentinit agent unset claude effortLevel
agentinit agent unset claude env --project
agentinit agent unset claude permissions.defaultMode --project
```

Persist a different default scope:

```bash
agentinit config agent-settings scope
agentinit config agent-settings scope project
agentinit config agent-settings clear-scope
```

Use `--value-json` when the value itself is JSON. Use `--json` when the command output should be machine-readable.
