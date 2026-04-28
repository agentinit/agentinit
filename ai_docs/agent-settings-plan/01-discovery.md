# Step 1: Discover Agent Settings

## Objective

Build a reliable catalog of configurable runtime settings for each supported agent:

- Claude
- Codex CLI
- OpenCode
- Cursor CLI
- Hermes
- OpenClaw

## Subagent Split

Run discovery in parallel with one subagent per area:

- Claude: settings, notifications, hooks, permissions, model, statusline, plugin interactions.
- Codex CLI: approval mode, sandboxing, model/provider, project/global config.
- OpenCode: config files, permission model, hooks/events, notifications, model/provider.
- Cursor CLI: CLI settings, model/provider, UI/runtime behavior, config paths.
- Hermes and OpenClaw: skill/runtime settings, global-only or project/global behavior, config format.

## Research Output

Each subagent should produce a markdown file plus structured setting rows:

```ts
type DiscoveredSetting = {
  agent: string;
  key: string;
  title: string;
  description: string;
  valueType: 'boolean' | 'enum' | 'string' | 'number' | 'array' | 'object' | 'preset';
  allowedValues?: string[];
  scopes: Array<'global' | 'project' | 'local'>;
  defaultScope: 'global' | 'project' | 'local';
  configFiles: string[];
  nativePath: string;
  writeStrategy: 'json-patch' | 'toml-patch' | 'yaml-patch' | 'file-template' | 'command';
  risk: 'safe' | 'destructive' | 'security-sensitive';
  examples: string[];
  sources: string[];
};
```

## Source Requirements

- Prefer official docs and source code.
- Record exact config file paths.
- Record whether a setting is global-scoped, project-scoped, local-scoped, or a combination.
- Record merge semantics: replace, append, map merge, ordered list, or generated file.
- Mark settings that execute commands or alter approval/sandbox behavior as `security-sensitive`.

## First Catalog Candidates

Use these as the initial query set:

- `notifications.turn-end`
- `hooks.pre-tool-use`
- `hooks.post-tool-use`
- `approval.mode`
- `model.default`
- `provider.default`
- `sandbox.mode`
- `ui.theme`
- `statusline.enabled`

## Acceptance Criteria

- Every discovered setting has a source.
- Unknown or unsupported settings are explicitly listed as unsupported.
- Settings with dangerous command execution are represented as presets unless raw mode is clearly required.
- The resulting catalog can be converted into registry definitions without extra interpretation.
