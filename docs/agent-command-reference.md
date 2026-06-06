# `agentinit agent` Reference

`agentinit agent` manages registry-backed native agent settings. The current implementation supports `claude`, `codex`, and `opencode` settings, plus typed hook operations for agents that expose native hooks.

When you omit `--global`, `--project`, and `--local`, `agentinit agent` defaults to `global`. You can override that default with `AGENTINIT_AGENT_DEFAULT_SCOPE=global|project|local` or persist a user preference with `agentinit config agent-settings scope <scope>`. Individual agents may support only a subset of scopes; Codex and OpenCode support `--global` and `--project`.

## Command Surface

```bash
agentinit agent list
agentinit agent list claude [--global|--project|--local] [--json] [--details]
agentinit agent list codex [--global|--project] [--json] [--details]
agentinit agent list opencode [--global|--project] [--json] [--details]
agentinit agent schema claude [--json]
agentinit agent schema codex [--json]
agentinit agent schema opencode [--json]

agentinit agent get claude [key] [--global|--project|--local] [--json]
agentinit agent set claude <key> <value> [--global|--project|--local] [--value-json] [--json] [--dry-run]
agentinit agent unset claude <key> [--global|--project|--local] [--json] [--dry-run]
agentinit agent get codex [key] [--global|--project] [--json]
agentinit agent set codex <key> <value> [--global|--project] [--value-json] [--json] [--dry-run]
agentinit agent unset codex <key> [--global|--project] [--json] [--dry-run]
agentinit agent get opencode [key] [--global|--project] [--json]
agentinit agent set opencode <key> <value> [--global|--project] [--value-json] [--json] [--dry-run]
agentinit agent unset opencode <key> [--global|--project] [--json] [--dry-run]

agentinit agent hook add claude <event> --command "<shell command>" [--matcher <matcher>] [--name <name>] [--global|--project|--local] [--json] [--dry-run]
agentinit agent hook list claude [event] [--global|--project|--local] [--json]
agentinit agent hook remove claude <event> <command-or-name> [--matcher <matcher>] [--global|--project|--local] [--json] [--dry-run]
agentinit agent hook add codex <event> --command "<shell command>" [--matcher <matcher>] [--name <name>] [--global|--project] [--json] [--dry-run]
agentinit agent hook list codex [event] [--global|--project] [--json]
agentinit agent hook remove codex <event> <command-or-name> [--matcher <matcher>] [--global|--project] [--json] [--dry-run]

agentinit agent api-key approve claude (--env <name>|--key <key>) [--json] [--dry-run]
agentinit agent api-key reject claude (--env <name>|--key <key>) [--json] [--dry-run]
agentinit agent api-key forget claude (--env <name>|--key <key>) [--json] [--dry-run]
agentinit agent api-key status claude (--env <name>|--key <key>) [--json]
```

## Supported Claude Setting Keys

- `theme`
- `editorMode`
- `verbose`
- `preferredNotifChannel`
- `autoCompactEnabled`
- `fileCheckpointingEnabled`
- `showTurnDuration`
- `terminalProgressBarEnabled`
- `todoFeatureEnabled`
- `teammateMode`
- `autoConnectIde`
- `autoInstallIdeExtension`
- `diffTool`
- `respectGitignore`
- `copyFullResponse`
- `copyOnSelect`
- `remoteControlAtStartup`
- `taskCompleteNotifEnabled`
- `inputNeededNotifEnabled`
- `agentPushNotifEnabled`
- `showStatusInTerminalTab`
- `prStatusFooterEnabled`
- `claudeInChromeDefaultEnabled`
- `teammateDefaultModel`
- `model`
- `agent`
- `env`
- `permissions.allow`
- `permissions.deny`
- `permissions.ask`
- `permissions.defaultMode`
- `permissions.disableBypassPermissionsMode`
- `permissions.additionalDirectories`
- `worktree.symlinkDirectories`
- `worktree.sparsePaths`
- `plansDirectory`
- `autoMemoryDirectory`
- `autoMemoryEnabled`
- `autoDreamEnabled`
- `alwaysThinkingEnabled`
- `effortLevel`
- `prefersReducedMotion`
- `attribution`
- `includeGitInstructions`
- `cleanupPeriodDays`
- `defaultShell`
- `showThinkingSummaries`
- `spinnerTipsEnabled`
- `autoUpdatesChannel`
- `language`
- `outputStyle`
- `defaultView`
- `useAutoModeDuringPlan`
- `includeCoAuthoredBy`
- `enableAllProjectMcpServers`
- `enabledMcpjsonServers`
- `disabledMcpjsonServers`
- `skipDangerousModePermissionPrompt`

## Supported Codex Setting Keys

Codex settings are written to `~/.codex/config.toml` for `--global` and `.codex/config.toml` for `--project`.

- `model`
- `model_provider`
- `model_reasoning_effort`
- `approval_policy`
- `sandbox_mode`
- `web_search`
- `notify`
- `instructions`
- `model_instructions_file`
- `features.apps`
- `features.codex_hooks`
- `features.fast_mode`
- `features.goals`
- `features.memories`
- `features.multi_agent`
- `features.personality`
- `features.shell_snapshot`
- `features.shell_tool`
- `features.unified_exec`
- `features.undo`
- `features.web_search`
- `features.web_search_cached`
- `features.web_search_request`

## Supported OpenCode Setting Keys

OpenCode settings are written to `~/.config/opencode/opencode.json` for `--global` and `.opencode/opencode.json` for `--project`. If the matching `opencode.jsonc` already exists, AgentInit updates that file instead; existing global `config.json` is also respected for older OpenCode installs. OpenCode does not have a native AgentInit `--local` settings scope.

- `model`
- `small_model`
- `provider`
- `default_agent`
- `autoupdate`
- `shell`
- `share`
- `username`
- `logLevel`
- `snapshot`
- `permission.*`
- `permission.bash`
- `permission.read`
- `permission.edit`
- `permission.webfetch`
- `permission.task`
- `permission.websearch`
- `compaction.auto`
- `tool_output.max_lines`
- `tool_output.max_bytes`

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

Codex supports `PreToolUse`, `PermissionRequest`, `PostToolUse`, `SessionStart`, `UserPromptSubmit`, and `Stop`. Accepted Codex aliases include `pre-tool-use`, `post-tool-use`, `permission-request`, `session-start`, and `user-prompt-submit`. OpenCode does not expose a native hook system through `agentinit agent hook`.

## Examples

Inspect supported agents and settings:

```bash
agentinit agent list
agentinit agent list claude
agentinit agent list codex
agentinit agent list opencode
agentinit agent schema claude
agentinit agent schema codex
agentinit agent schema opencode
agentinit agent schema claude --json
agentinit agent schema codex --json
agentinit agent schema opencode --json
```

`agent schema <agent>` is the reference view: it shows the registered schema,
types, categories, descriptions, risks, and supported scopes without reading the
current settings files. `agent list <agent>` is the browsable state view: it
shows the same descriptions plus safe current-value summaries for the selected
scope. Unsupported agent scopes are rejected; settings outside a supported
selected scope are shown as not applicable. `agent get <agent> [key]` prints
exact raw values.

For compatibility, `agent list <agent> --json` still returns only the supported
key array. Use `agent list <agent> --details --json` for detailed metadata and
safe current-state summaries.

Read settings in human or JSON form:

```bash
agentinit agent get claude
agentinit agent get claude --project
agentinit agent get claude model
agentinit agent get claude model --json
agentinit agent get claude env --project --json
agentinit agent get claude permissions.allow --project --json
agentinit agent get codex
agentinit agent get codex --project
agentinit agent get codex features.codex_hooks
agentinit agent get codex web_search --json
agentinit agent get opencode
agentinit agent get opencode --project
agentinit agent get opencode model
agentinit agent get opencode permission.* --project --json
```

Global full reads include regular `~/.claude/settings.json` values plus registered AgentInit-managed `~/.claude.json` settings. Internal Claude global config state such as `projects`, auth records, caches, and usage counters is not exposed.

Set string values:

```bash
agentinit agent set claude model sonnet
agentinit agent set claude agent reviewer --project
agentinit agent set claude plansDirectory .claude/plans --project
agentinit agent set claude language spanish
agentinit agent set claude outputStyle concise
agentinit agent set claude teammateDefaultModel sonnet
agentinit agent set codex model gpt-5.4
agentinit agent set codex model_provider openai
agentinit agent set codex model_instructions_file AGENTS.md --project
agentinit agent set opencode model anthropic/claude-sonnet-4-5
agentinit agent set opencode small_model anthropic/claude-haiku-4-5
agentinit agent set opencode default_agent my_custom --project
agentinit agent set opencode shell zsh
```

Set booleans:

```bash
agentinit agent set claude verbose true
agentinit agent set claude autoCompactEnabled on
agentinit agent set claude fileCheckpointingEnabled true
agentinit agent set claude showTurnDuration false
agentinit agent set claude terminalProgressBarEnabled true
agentinit agent set claude todoFeatureEnabled true
agentinit agent set claude autoConnectIde false
agentinit agent set claude autoInstallIdeExtension true
agentinit agent set claude respectGitignore true
agentinit agent set claude copyFullResponse false
agentinit agent set claude copyOnSelect true
agentinit agent set claude remoteControlAtStartup true
agentinit agent set claude taskCompleteNotifEnabled true
agentinit agent set claude inputNeededNotifEnabled true
agentinit agent set claude agentPushNotifEnabled false
agentinit agent set claude showStatusInTerminalTab true
agentinit agent set claude prStatusFooterEnabled true
agentinit agent set claude claudeInChromeDefaultEnabled true
agentinit agent set claude alwaysThinkingEnabled on
agentinit agent set claude autoMemoryEnabled true
agentinit agent set claude autoDreamEnabled false
agentinit agent set claude prefersReducedMotion true
agentinit agent set claude includeGitInstructions false
agentinit agent set claude showThinkingSummaries yes
agentinit agent set claude spinnerTipsEnabled off
agentinit agent set claude enableAllProjectMcpServers true --project
agentinit agent set claude skipDangerousModePermissionPrompt true
agentinit agent set claude useAutoModeDuringPlan true --local
agentinit agent set codex features.apps false
agentinit agent set codex features.codex_hooks true
agentinit agent set codex features.fast_mode true
agentinit agent set codex features.memories false
agentinit agent set codex features.multi_agent true
agentinit agent set codex features.personality true
agentinit agent set codex features.shell_snapshot true
agentinit agent set codex features.shell_tool true
agentinit agent set codex features.unified_exec true
agentinit agent set codex features.undo false
agentinit agent set opencode autoupdate false
agentinit agent set opencode snapshot true --project
agentinit agent set opencode compaction.auto true
```

Set enums:

```bash
agentinit agent set claude theme dark
agentinit agent set claude editorMode vim
agentinit agent set claude preferredNotifChannel terminal_bell
agentinit agent set claude teammateMode auto
agentinit agent set claude diffTool auto
agentinit agent set claude effortLevel high
agentinit agent set claude permissions.defaultMode acceptEdits --project
agentinit agent set claude permissions.defaultMode dontAsk --local
agentinit agent set claude permissions.disableBypassPermissionsMode disable
agentinit agent set claude autoUpdatesChannel stable
agentinit agent set claude defaultView chat --local
agentinit agent set codex model_reasoning_effort high
agentinit agent set codex approval_policy on-request --project
agentinit agent set codex sandbox_mode workspace-write --project
agentinit agent set codex web_search live
agentinit agent set opencode share manual
agentinit agent set opencode logLevel INFO
agentinit agent set opencode autoupdate notify
agentinit agent set opencode permission.* ask --project
agentinit agent set opencode permission.bash allow --project
agentinit agent set opencode permission.edit deny --project
```

Set numbers:

```bash
agentinit agent set claude cleanupPeriodDays 30
agentinit agent set opencode tool_output.max_lines 5000
agentinit agent set opencode tool_output.max_bytes 100000
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
agentinit agent set codex notify '["terminal-notifier","-message","Codex finished"]' --value-json
```

Set objects:

```bash
agentinit agent set claude env '{"AGENTINIT_TEST":"1"}' --value-json
agentinit agent set claude env '{"NODE_ENV":"test","CI":"1"}' --project --value-json
agentinit agent set claude attribution '{"coAuthoredBy":"AgentInit"}' --value-json
agentinit agent set opencode provider '{"local-llm":{"name":"Local LLM","npm":"@ai-sdk/openai-compatible","options":{"baseURL":"http://localhost:11434/v1","apiKey":"{env:LOCAL_LLM_API_KEY}"},"models":{"llama-3":{"name":"Llama 3","tool_call":true}}}}' --project --value-json
```

OpenCode provider configuration can contain API keys. Prefer OpenCode's `{env:NAME}` substitution instead of writing raw secrets into config files.

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

Add and inspect Codex hooks in `config.toml`:

```bash
agentinit agent set codex features.codex_hooks true
agentinit agent hook add codex pre-tool-use --command "npm run lint" --matcher "^Bash$" --project
agentinit agent hook add codex post-tool-use --command "npm test" --matcher "^Bash$" --name test-after-bash --project
agentinit agent hook add codex user-prompt-submit --command "scripts/check-prompt.sh" --project
agentinit agent hook list codex --project
agentinit agent hook list codex pre-tool-use --project --json
agentinit agent hook remove codex post-tool-use test-after-bash --matcher "^Bash$" --project
```

Manage Claude custom API key trust responses:

```bash
agentinit agent api-key approve claude --env ANTHROPIC_API_KEY
agentinit agent api-key status claude --env ANTHROPIC_API_KEY --json
agentinit agent api-key reject claude --key sk-ant-...
agentinit agent api-key forget claude --env ANTHROPIC_API_KEY
```

The raw API key is never written to `~/.claude.json` by these commands. AgentInit stores and prints only Claude's normalized last-20-character fingerprint. Prefer `--env`; `--key` is supported for convenience but can expose the raw key in shell history and process listings, and the CLI warns on human-readable runs.

Preview writes without changing files:

```bash
agentinit agent set claude effortLevel high --dry-run
agentinit agent unset claude includeGitInstructions --dry-run
agentinit agent hook add claude after-tool-use --command "npm test" --project --dry-run
agentinit agent hook add codex pre-tool-use --command "npm test" --project --dry-run
agentinit agent api-key approve claude --env ANTHROPIC_API_KEY --dry-run
```

Machine-readable output:

```bash
agentinit agent set claude model sonnet --json
agentinit agent get claude model --json
agentinit agent unset claude effortLevel --json
agentinit agent hook list claude post-tool-use --project --json
agentinit agent hook list codex pre-tool-use --project --json
agentinit agent api-key status claude --env ANTHROPIC_API_KEY --json
```

Remove settings:

```bash
agentinit agent unset claude effortLevel
agentinit agent unset claude env --project
agentinit agent unset claude permissions.defaultMode --project
agentinit agent unset claude remoteControlAtStartup
agentinit agent unset claude defaultView --local
```

Persist a different default scope if you want repo-local behavior:

```bash
agentinit config agent-settings scope
agentinit config agent-settings scope project
agentinit config agent-settings clear-scope
```

Use `--value-json` when the value itself is JSON. Use `--json` when the command output should be machine-readable.
