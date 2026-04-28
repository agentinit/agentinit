# Step 2: CLI Implementation

## Objective

Implement the `agentinit agent` command family using a registry and adapter architecture.

## Commands

```bash
agentinit agent set <agent> <key> <value> [--global|--project] [--value-json] [--json] [--dry-run]
agentinit agent get <agent> [key] [--global|--project] [--json]
agentinit agent unset <agent> <key> [--global|--project] [--json] [--dry-run]
agentinit agent list [agent] [--json]
agentinit agent schema <agent> [--json]
agentinit agent hook add <agent> <event> --command <command> [--matcher <matcher>] [--name <name>] [--global|--project] [--json] [--dry-run]
agentinit agent hook list <agent> [event] [--global|--project] [--json]
agentinit agent hook remove <agent> <event> <command-or-name> [--matcher <matcher>] [--global|--project] [--json] [--dry-run]
```

## Proposed Files

```txt
src/commands/agent.ts
src/core/agentSettings/
  registry.ts
  settingsManager.ts
  valueParser.ts
  types.ts
  adapters/
    claude.ts
    codex.ts
    opencode.ts
    cursor.ts
    hermes.ts
    openclaw.ts
tests/commands/agent.test.ts
tests/core/agentSettings/
```

## Core Types

```ts
type AgentSettingDefinition = {
  agent: string;
  key: string;
  title: string;
  description: string;
  valueType: 'boolean' | 'enum' | 'string' | 'number' | 'array' | 'object' | 'preset';
  scopes: Array<'project' | 'global'>;
  defaultScope: 'project' | 'global';
  allowedValues?: string[];
  presets?: Record<string, unknown>;
  risk: 'safe' | 'destructive' | 'security-sensitive';
  parse(raw: string, flags: AgentSetFlags): unknown;
  read(ctx: AgentSettingContext): Promise<unknown>;
  apply(ctx: AgentSettingContext, value: unknown): Promise<SettingsPatchResult>;
  unset(ctx: AgentSettingContext): Promise<SettingsPatchResult>;
};
```

## Value Parsing

- `on/off`, `yes/no`, `true/false` map to booleans.
- Enum values must match registry values.
- Numbers must reject `NaN` and non-finite values.
- Objects require `--value-json`; arrays accept a single string value by default or an array with `--value-json`.
- `--json` controls command output only.
- Presets must match registry names.

## Write Behavior

- Read existing config.
- Preserve unrelated keys.
- Validate before writing.
- Create parent directories when needed.
- Use atomic write where practical.
- Support `--dry-run` that prints changed paths and before/after summaries.
- Never emit or install arbitrary hook shell from website-facing presets.

## Initial Preset Example

Preset-backed settings are future work. Raw command-executing settings such as Claude hooks, status lines, and sandbox overrides must not appear in the generic settings registry. Hooks are managed through typed append/list/remove operations so custom commands can be explicit and existing hook entries are preserved.

## Tests

- `set` writes the correct config for each supported value type.
- `get` reads existing native config.
- `get --json` emits valid JSON for strings, objects, missing values, and full-file reads.
- `unset` removes only the target setting.
- Unknown key fails with suggestions.
- Invalid value fails before writing.
- `--dry-run` does not write files.
- Security-sensitive settings require preset validation or are excluded from the registry.
- Hook commands are added only through explicit `agent hook add --command`, not raw `agent set claude hooks`.
- Hook add/remove preserves unrelated events, matchers, and hook commands.
- AgentInit-managed plugin state is not exposed as raw agent settings.
- `schema` output is stable and machine-readable.

## Acceptance Criteria

- `agentinit agent schema claude --json` can drive website command generation.
- No agent-specific file writes are implemented in the command layer.
- Existing config is preserved across all adapters.
- Tests cover at least one boolean, enum, string, and preset setting.
