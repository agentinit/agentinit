# Agent Settings Plan

## Goal

Add a stable `agentinit agent ...` command family for configuring agent-specific runtime behavior across Claude, Codex, OpenCode, Cursor CLI, Hermes, and OpenClaw.

This is separate from `agentinit config`, which manages AgentInit's own configuration. The new command configures the target agent.

## Public CLI Shape

```bash
agentinit agent set <agent> <key> <value>
agentinit agent get <agent> [key]
agentinit agent unset <agent> <key>
agentinit agent list [agent]
agentinit agent schema <agent>
```

Examples:

```bash
agentinit agent set claude model sonnet --global
agentinit agent set claude permissions.defaultMode acceptEdits --project
agentinit agent set claude env '{"AGENTINIT_TEST":"1"}' --project --value-json
agentinit agent hook add claude after-tool-use --command "npm run lint" --matcher "Edit|Write" --project
agentinit agent schema claude --json
```

## Design Principles

- Registry-backed keys only. The CLI must reject unknown settings unless an explicit raw/advanced mode is added later.
- Typed values. Parse booleans, enums, strings, numbers, arrays, objects, and presets consistently.
- Typed operations for risky behavior. Website/chat output should prefer named presets like `danger-command-guard`, not raw shell. Custom hook commands are supported only through explicit `agent hook add --command ...` operations, not raw `hooks` JSON writes.
- Safe writes. Preserve unrelated agent config, support `--dry-run`, and use existing backup/managed-state patterns where applicable.
- Schema as contract. The website and chat skill should consume `agentinit agent schema`, not duplicate setting knowledge.

## Deliverables

- Research artifacts for each supported agent.
- Agent setting registry and adapters.
- `agentinit agent` command family.
- Website action-plan contract.
- Optional skill that teaches chat assistants to map user intent to `agentinit agent ...` commands.
