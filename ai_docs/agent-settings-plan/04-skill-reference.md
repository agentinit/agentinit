# Step 4: Skill and Chat Reference

## Objective

Create a skill that helps chat assistants convert user requests into `agentinit agent ...` commands without duplicating the CLI registry as prose.

## Skill Name

```txt
agentinit-agent-settings
```

## Location

Recommended project skill location:

```txt
.agents/skills/agentinit-agent-settings/SKILL.md
```

If this becomes generally useful, publish it through the normal AgentInit skill/plugin marketplace path later.

## Skill Role

The skill should:

- Trigger when users ask to configure Claude, Codex, OpenCode, Cursor CLI, Hermes, or OpenClaw runtime behavior.
- Prefer `agentinit agent set|get|unset|list|schema`.
- Query or reference `agentinit agent schema <agent>` when exact keys are needed.
- Use `agentinit agent list <agent> --details --json` when current state is needed; use only scopes supported by the selected agent.
- Emit validated commands, not raw config patches.
- Prefer presets for hooks and security-sensitive settings when those preset-backed keys are present in `agentinit agent schema`.
- Use `agentinit agent hook add/list/remove` for explicit custom hook commands.
- Use `agentinit agent api-key approve|reject|forget|status claude --env <name>` for Claude custom API key trust responses when possible.
- Treat status lines, sandbox overrides, and plugin enablement state as unsupported when the schema does not expose safe keys for them.
- Do not emit raw `customApiKeyResponses` JSON. If the user asks to use `--key`, warn that it can expose the raw key in shell history and process listings.
- Ask for clarification only when the registry cannot resolve intent safely.

## Skill Should Not Be Source of Truth

The skill must not hardcode a full settings catalog. The CLI registry/schema is the contract.

The skill can include examples and resolution patterns, but should instruct the assistant to use:

```bash
agentinit agent schema <agent> --json
```

when available.

## Draft Skill Outline

```md
---
name: agentinit-agent-settings
description: Use when a user asks to configure runtime behavior for Claude, Codex CLI, OpenCode, Cursor CLI, Hermes, or OpenClaw. Converts natural language into safe `agentinit agent ...` commands and uses registry-backed setting keys and presets.
---

# AgentInit Agent Settings

Use `agentinit agent` as the public interface.

Prefer:
agentinit agent set <agent> <key> <value> [--global|--project|--local when supported]
agentinit agent hook add <agent> <event> --command <command> [--matcher <matcher>] [--global|--project|--local when supported]
agentinit agent api-key approve claude --env <name>

Do not invent setting keys. If uncertain, inspect:
agentinit agent schema <agent> --json

When the user asks what is currently configured, inspect:
agentinit agent list <agent> --details --json

Use --value-json when the setting value itself is JSON. Use --json for machine-readable command output.

For hooks and command execution, prefer presets when the schema exposes preset-backed keys. For custom hooks, require an explicit user-provided or user-approved command and use `agentinit agent hook add`. Do not generate raw hook/status/sandbox JSON.

For Claude custom API keys, prefer typed `agent api-key` commands with `--env`; never generate raw `customApiKeyResponses` JSON. If using `--key`, include a shell-history/process-listing warning.
```

## Example Skill Behavior

Input:

```txt
Turn on Claude notifications after each response.
```

Output:

```bash
agentinit agent set claude notifications.turn-end on --global
```

## Tests for the Skill

Create eval prompts later:

- "Set Claude to use Sonnet globally."
- "Set Claude project default mode to accept edits."
- "Make Codex require strict approval."
- "After Claude edits files, run npm test." Expected behavior: ask whether to use `agentinit agent hook add claude after-tool-use --command "npm test"` and what matcher/scope to use if unclear; omitted scope follows the AgentInit effective default and may be global.
- "Add a dangerous command guard before Claude tool use." Expected behavior until preset keys ship: unsupported unless the user supplies the exact command; raw hook JSON is never emitted.
- "Show me all configurable Cursor CLI settings."

## Acceptance Criteria

- The skill consistently emits `agentinit agent ...` commands.
- The skill does not produce direct JSON/TOML edits unless explicitly asked and supported.
- The skill defers unsupported settings to `agentinit agent schema`.
