# `agentinit agent` Reference

`agentinit agent` manages registry-backed native agent settings. The current implementation supports `claude` settings and typed Claude hook operations.

When you omit `--global`, `--project`, and `--local`, `agentinit agent` defaults to `global`. You can override that default with `AGENTINIT_AGENT_DEFAULT_SCOPE=global|project|local` or persist a user preference with `agentinit config agent-settings scope <scope>`.

## Command Surface

```bash
agentinit agent list
agentinit agent list claude
agentinit agent schema claude [--json]

agentinit agent get claude [key] [--global|--project|--local] [--json]
agentinit agent set claude <key> <value> [--global|--project|--local] [--value-json] [--json] [--dry-run]
agentinit agent unset claude <key> [--global|--project|--local] [--json] [--dry-run]

agentinit agent hook add claude <event> --command "<shell command>" [--matcher <matcher>] [--name <name>] [--global|--project|--local] [--json] [--dry-run]
agentinit agent hook list claude [event] [--global|--project|--local] [--json]
agentinit agent hook remove claude <event> <command-or-name> [--matcher <matcher>] [--global|--project|--local] [--json] [--dry-run]
```

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

## Hook Events

- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`
- `Notification`
- `PermissionRequest`
- `Stop`
- `SessionStart`
- `SessionEnd`

Accepted aliases include `before-tool-use`, `after-tool-use`, `post-tool-use-failure`, `permission-request`, `session-start`, and `session-end`.

## Examples

Inspect supported agents and settings:

```bash
agentinit agent list
agentinit agent list claude
agentinit agent schema claude
agentinit agent schema claude --json
```

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

Add and inspect Claude hooks without replacing the whole hooks object:

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

Persist a different default scope if you want repo-local behavior:

```bash
agentinit config agent-settings scope
agentinit config agent-settings scope project
agentinit config agent-settings clear-scope
```

Use `--value-json` when the value itself is JSON. Use `--json` when the command output should be machine-readable.
