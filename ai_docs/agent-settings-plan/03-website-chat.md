# Step 3: Website and Chat Translation

## Objective

Let users describe desired agent behavior in natural language and receive safe, validated `agentinit agent ...` commands.

## User Flow

Input:

```txt
Set Claude to use Sonnet globally and accept edits by default in this project.
```

Resolved action plan:

```json
[
  {
    "op": "set",
    "agent": "claude",
    "key": "model",
    "value": "sonnet",
    "scope": "global"
  },
  {
    "op": "set",
    "agent": "claude",
    "key": "permissions.defaultMode",
    "value": "acceptEdits",
    "scope": "project"
  }
]
```

Rendered commands:

```bash
agentinit agent set claude model sonnet --global
agentinit agent set claude permissions.defaultMode acceptEdits --project
```

## Backend Contract

The translator should output a canonical action plan, not raw shell:

```ts
type AgentSettingsAction = {
  op: 'set' | 'unset' | 'get';
  agent: string;
  key?: string;
  value?: string;
  scope?: 'global' | 'project' | 'local';
};
```

## Validation

The backend must validate every action against registry/schema data:

- Agent exists.
- Key exists for that agent.
- Scope is supported. If scope is omitted, AgentInit resolves the effective default from env, user config, then the built-in global default.
- Value is valid for the setting.
- Security-sensitive settings use approved presets.
- Requests for custom hooks must render typed `agentinit agent hook add ... --command ...` commands only after the user explicitly provides or approves the command.
- Requests for raw status line commands or sandbox overrides must return an unsupported response until typed or preset-backed keys are available.

## Command Rendering

Render shell only after validation:

```ts
render(action) =>
  `agentinit agent set ${agent} ${key} ${shellQuote(value)} ${scopeFlag}`
```

Render hooks as typed hook commands, not as raw JSON:

```ts
render(hookAction) =>
  `agentinit agent hook add ${agent} ${event} --command ${shellQuote(command)} ${matcherFlag} ${scopeFlag}`
```

Only include `scopeFlag` when the user explicitly requests global, project, or local scope. For hooks, ask before omitting scope when the requested behavior could affect every Claude project.

Do not let the LLM produce shell directly.

## Clarification Rules

Ask a follow-up only when needed:

- Multiple agents match and user did not specify one.
- Setting intent maps to multiple keys with different effects.
- Scope matters and no safe default exists.
- Requested value is unsupported.

Do not ask for clarification when a safe preset exists.

## Safety Rules

- Never generate raw hook JSON from natural language.
- Custom hooks require explicit user-provided or user-approved commands.
- Prefer presets such as `danger-command-guard` once the CLI exposes those preset-backed keys.
- Mark security-sensitive commands visibly in the UI.
- Show `--dry-run` variants for users who want to preview changes.

## Acceptance Criteria

- The website can consume `agentinit agent schema <agent> --json`.
- Natural language output is an action plan first, shell second.
- Unsupported requests return a clear explanation and nearest supported alternatives.
- Generated commands are copy-paste safe.
