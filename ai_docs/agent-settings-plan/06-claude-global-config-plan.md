# Step 6: Claude Global Config Support

## Objective

Extend `agentinit agent` so Claude settings can cover both Claude config stores:

- `~/.claude/settings.json`: user/project/local settings already handled by the current adapter.
- `~/.claude.json`: Claude global runtime config, including UI preferences, notification preferences, and custom API key approval state.

The public API should keep using stable `agentinit agent ...` commands. It should not expose raw `~/.claude.json` object editing.

## Findings

`~/.claude.json` can be large because it stores `projects`. A reduced local copy was inspected with only one `projects` entry to avoid loading unrelated project history. No sensitive values should be copied into docs or tests.

Observed top-level categories include:

- global user preferences: `theme`, `editorMode`, `verbose`, `autoCompactEnabled`, notification settings
- runtime/cache/state: `numStartups`, GrowthBook/Statsig caches, release-note state, usage counters
- auth state: `customApiKeyResponses`, `primaryApiKey`, OAuth account state
- project state: `projects`
- MCP and plugin/runtime state: `mcpServers`, `skillUsage`, `toolUsage`, marketplace install flags

Most of this file is internal runtime state and should not become a generic public settings surface.

## Source References

Claude Code source:

- `utils/config.ts`: defines `GlobalConfig` and reads/writes `~/.claude.json`.
- `tools/ConfigTool/supportedSettings.ts`: lists user-facing settings Claude exposes through its own config tool.
- `components/Settings/Config.tsx`: toggles custom API key approval in `customApiKeyResponses`.
- `components/ApproveApiKey.tsx`: writes approved/rejected custom API key responses.
- `utils/auth.ts`: checks `customApiKeyResponses.approved` before accepting `ANTHROPIC_API_KEY`.
- `utils/authPortable.ts`: normalizes API keys for config by storing only the last 20 characters.

## Implemented User-Facing Global Settings

Claude's own ConfigTool exposes these global settings from `~/.claude.json`. AgentInit now models the stable allowlist as global-only settings:

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
- `remoteControlAtStartup`
- `taskCompleteNotifEnabled`
- `inputNeededNotifEnabled`
- `agentPushNotifEnabled`
- `autoConnectIde`
- `autoInstallIdeExtension`
- `diffTool`
- `respectGitignore`
- `copyFullResponse`
- `copyOnSelect`
- `showStatusInTerminalTab`
- `prStatusFooterEnabled`
- `claudeInChromeDefaultEnabled`
- `teammateDefaultModel`

Some settings are feature-gated in Claude source. AgentInit should either include stable known keys conservatively or mark feature-gated keys as best-effort/global-only in schema metadata.

## Custom API Key Approval

`customApiKeyResponses` is useful but should not be exposed as a raw object setting.

Claude stores:

```json
{
  "customApiKeyResponses": {
    "approved": ["<last-20-chars-of-key>"],
    "rejected": ["<last-20-chars-of-key>"]
  }
}
```

Claude checks whether `normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY)` is present in `approved`. `normalizeApiKeyForConfig` returns `apiKey.slice(-20)`.

Implemented public API:

```bash
agentinit agent api-key approve claude --env ANTHROPIC_API_KEY
agentinit agent api-key reject claude --env ANTHROPIC_API_KEY
agentinit agent api-key status claude --env ANTHROPIC_API_KEY
agentinit agent api-key forget claude --env ANTHROPIC_API_KEY
```

Optional explicit-key mode:

```bash
agentinit agent api-key approve claude --key sk-ant-...
```

If `--key` is used, the CLI should warn in human-readable output that raw command-line keys can leak through shell history and process listings. JSON output must remain machine-readable and include status and fingerprint only. AgentInit must never print or persist the raw key.

Do not add:

```bash
agentinit agent set claude customApiKeyResponses ...
```

That would be too easy to misuse and would expose credential-trust state as raw JSON.

## Implementation Plan

1. Add per-setting storage path support to agent settings definitions.

The adapter now supports per-setting storage because not every Claude setting lives in the same file. Definitions can use:

```ts
store?: 'settings' | 'globalConfig'
```

For Claude:

- `store: 'settings'` maps to `~/.claude/settings.json`, `.claude/settings.json`, or `.claude/settings.local.json`.
- `store: 'globalConfig'` maps only to `~/.claude.json` and supports global scope only.

2. Add global-config definitions for safe user-facing keys.

Use Claude ConfigTool as the first source of truth. Global-only definitions were added for:

- `theme`: enum/string, depending on how much of Claude theme options we want to mirror
- `editorMode`: enum
- `verbose`: boolean
- `preferredNotifChannel`: enum
- `autoCompactEnabled`: boolean
- `fileCheckpointingEnabled`: boolean
- `showTurnDuration`: boolean
- `terminalProgressBarEnabled`: boolean
- `todoFeatureEnabled`: boolean
- `teammateMode`: enum
- `remoteControlAtStartup`: boolean
- notification booleans: `taskCompleteNotifEnabled`, `inputNeededNotifEnabled`, `agentPushNotifEnabled`
- IDE/UI/remote extras: `autoConnectIde`, `autoInstallIdeExtension`, `diffTool`, `respectGitignore`, `copyFullResponse`, `copyOnSelect`, `showStatusInTerminalTab`, `prStatusFooterEnabled`, `claudeInChromeDefaultEnabled`, `teammateDefaultModel`

3. Add typed API-key trust commands.

Add a subcommand under `agent` rather than raw settings:

```bash
agentinit agent api-key approve claude --env ANTHROPIC_API_KEY
agentinit agent api-key reject claude --env ANTHROPIC_API_KEY
agentinit agent api-key status claude --env ANTHROPIC_API_KEY --json
agentinit agent api-key forget claude --env ANTHROPIC_API_KEY
```

Behavior:

- resolve the key from the named environment variable or explicit `--key`
- normalize with `key.slice(-20)` to match Claude
- ensure `customApiKeyResponses.approved` and `.rejected` arrays exist
- `approve`: add fingerprint to approved and remove it from rejected
- `reject`: add fingerprint to rejected and remove it from approved
- `forget`: remove fingerprint from both arrays
- `status`: return `approved`, `rejected`, or `unknown`

4. Preserve unrelated `~/.claude.json` state.

All writes must read/modify/write only the target path while preserving caches, `projects`, auth state, and other runtime keys.

5. Do not expose internal state.

Exclude from generic registry:

- `projects`
- `primaryApiKey`
- `oauthAccount`
- `mcpServers` in `~/.claude.json`
- usage counters and caches
- GrowthBook/Statsig caches
- marketplace/plugin runtime state

6. Update docs and skill guidance.

Update:

- `docs/agent-command-reference.md`
- `README.md` short examples only if needed
- `ai_docs/agent-settings-plan/04-skill-reference.md`

Skill guidance should say custom API key approval uses typed `agent api-key ...` commands, not raw `customApiKeyResponses` JSON.

## Tests

Add manager tests:

- setting a `store: 'globalConfig'` key writes `~/.claude.json`
- global config writes preserve unrelated top-level keys and `projects`
- project/local scope is rejected for global-config-only keys
- `customApiKeyResponses` is not exposed as a generic schema key

Add API-key command tests:

- approve adds normalized last-20 fingerprint to `approved`
- approve removes same fingerprint from `rejected`
- reject does the inverse
- forget removes from both arrays
- status reports approved/rejected/unknown
- raw key is not printed in human or JSON output

Add CLI tests:

- `agent set claude theme dark --global`
- `agent get claude preferredNotifChannel --global --json`
- `agent api-key approve claude --key ... --json`

## Open Questions

- Whether to expose all ConfigTool global settings immediately or start with `customApiKeyResponses` plus the low-risk preference keys.
- Whether a future stdin or hidden prompt mode is needed for API key trust management in addition to `--env` and `--key`.
- Whether feature-gated settings should be visible in schema unconditionally or omitted until AgentInit can detect Claude feature gates.
