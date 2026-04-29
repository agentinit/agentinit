import { join } from 'path';
import { expandTilde } from '../../../utils/paths.js';
import type { AgentSettingsAdapter, AgentSettingDefinition, AgentSettingsScope } from '../types.js';

const ALL_SCOPES: AgentSettingsScope[] = ['global', 'project', 'local'];

function setting(
  key: string,
  valueType: AgentSettingDefinition['valueType'],
  title: string,
  description: string,
  options: Partial<Omit<AgentSettingDefinition, 'agent' | 'key' | 'title' | 'description' | 'valueType'>> = {},
): AgentSettingDefinition {
  const definition: AgentSettingDefinition = {
    agent: 'hermes',
    key,
    nativePath: options.nativePath ?? key.split('.'),
    title,
    description,
    valueType,
    scopes: options.scopes ?? ALL_SCOPES,
    defaultScope: options.defaultScope ?? 'global',
    category: options.category ?? 'settings',
    risk: options.risk ?? 'safe',
  };

  if (options.allowedValues) {
    definition.allowedValues = options.allowedValues;
  }
  if (options.deprecated !== undefined) {
    definition.deprecated = options.deprecated;
  }
  if (options.replacement) {
    definition.replacement = options.replacement;
  }

  return definition;
}

/**
 * Hermes Agent settings adapter.
 *
 * Hermes uses a single YAML config file (~/.hermes/config.yaml) with nested
 * sections (model, display, agent, toolsets, memory, etc.).
 *
 * There is no per-project or local config file — Hermes only supports global settings.
 * Attempting to use --project or --local will error. This is by design since Hermes
 * does not have a project-scoped config concept.
 *
 * No hooks: Hermes does not have a hook system. Hook subcommands remain Claude-only.
 *
 * Reference: Hermes docs + hermes_cli/config.py for env var and key mappings.
 */
export const hermesSettingsAdapter: AgentSettingsAdapter = {
  agent: 'hermes',
  displayName: 'Hermes Agent',
  format: 'yaml',
  definitions: [
    // ── Model ─────────────────────────────────────────
    setting('model.default', 'string', 'Default model', 'Default LLM model identifier (e.g. claude-sonnet-4, gpt-4o).', {
      defaultScope: 'global',
      category: 'model',
    }),
    setting('model.provider', 'string', 'Model provider', 'Provider slug: openai, anthropic, google, etc.', {
      defaultScope: 'global',
      category: 'model',
    }),
    setting('model.base_url', 'string', 'API base URL', 'Custom OpenAI-compatible endpoint (empty = provider default).', {
      defaultScope: 'global',
      category: 'model',
    }),

    // ── Agent runtime ─────────────────────────────────
    setting('agent.max_turns', 'number', 'Max turns', 'Maximum tool-calling iterations per conversation.', {
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('agent.verbose', 'boolean', 'Verbose mode', 'Show full tool output instead of summaries.', {
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('agent.reasoning_effort', 'enum', 'Reasoning effort', 'Control reasoning depth for supported models.', {
      allowedValues: ['low', 'medium', 'high'],
      defaultScope: 'global',
      category: 'runtime',
    }),
    setting('agent.service_tier', 'string', 'Service tier', 'Provider service tier (e.g. default, flex).', {
      defaultScope: 'global',
      category: 'runtime',
    }),

    // ── Display ───────────────────────────────────────
    setting('display.compact', 'boolean', 'Compact output', 'Suppress banners and fluff for quieter sessions.', {
      defaultScope: 'global',
      category: 'display',
    }),
    setting('display.show_reasoning', 'boolean', 'Show reasoning', 'Display chain-of-thought reasoning steps.', {
      defaultScope: 'global',
      category: 'display',
    }),
    setting('display.streaming', 'boolean', 'Streaming', 'Stream assistant responses token-by-token.', {
      defaultScope: 'global',
      category: 'display',
    }),
    setting('display.skin', 'string', 'CLI skin', 'Terminal UI theme name (default, minimal, etc.).', {
      defaultScope: 'global',
      category: 'display',
    }),
    setting('display.personality', 'string', 'Personality', 'Response persona key (helpful, kawaii, noir, etc.).', {
      defaultScope: 'global',
      category: 'display',
    }),

    // ── Terminal ──────────────────────────────────────
    setting('terminal.env_type', 'enum', 'Terminal backend', 'Execution environment: local, docker, ssh, modal, etc.', {
      allowedValues: ['local', 'docker', 'ssh', 'modal', 'singularity', 'daytona'],
      defaultScope: 'global',
      category: 'terminal',
    }),
    setting('terminal.timeout', 'number', 'Command timeout', 'Max seconds before killing a shell command.', {
      defaultScope: 'global',
      category: 'terminal',
    }),
    setting('terminal.lifetime_seconds', 'number', 'Session lifetime', 'Max seconds a terminal session stays alive.', {
      defaultScope: 'global',
      category: 'terminal',
    }),

    // ── Compression ───────────────────────────────────
    setting('compression.enabled', 'boolean', 'Auto compression', 'Compress conversation context when near limit.', {
      defaultScope: 'global',
      category: 'compression',
    }),
    setting('compression.threshold', 'number', 'Compression threshold', 'Fraction of context window before compression (0.0-1.0).', {
      defaultScope: 'global',
      category: 'compression',
    }),

    // ── Code execution ─────────────────────────────────
    setting('code_execution.timeout', 'number', 'Sandbox timeout', 'Max seconds for code-exec sandbox scripts.', {
      defaultScope: 'global',
      category: 'code_execution',
    }),
    setting('code_execution.max_tool_calls', 'number', 'Max tool calls', 'Max RPC tool calls per code-exec session.', {
      defaultScope: 'global',
      category: 'code_execution',
    }),

    // ── Memory ────────────────────────────────────────
    setting('memory.memory_enabled', 'boolean', 'Memory enabled', 'Inject stored memories into context.', {
      defaultScope: 'global',
      category: 'memory',
    }),
    setting('memory.user_profile_enabled', 'boolean', 'User profile', 'Track user preferences in persistent profile.', {
      defaultScope: 'global',
      category: 'memory',
    }),
    setting('memory.memory_char_limit', 'number', 'Memory size limit', 'Max chars injected from memory store.', {
      defaultScope: 'global',
      category: 'memory',
    }),

    // ── Logging ───────────────────────────────────────
    setting('logging.level', 'enum', 'Log level', 'Minimum log verbosity.', {
      allowedValues: ['DEBUG', 'INFO', 'WARNING', 'ERROR'],
      defaultScope: 'global',
      category: 'logging',
    }),

    // ── Delegation ────────────────────────────────────
    setting('delegation.max_iterations', 'number', 'Subagent max turns', 'Max tool-calling turns per child agent.', {
      defaultScope: 'global',
      category: 'delegation',
    }),
    setting('delegation.max_concurrent_children', 'number', 'Concurrent children', 'Max parallel subagents.', {
      defaultScope: 'global',
      category: 'delegation',
    }),
    setting('delegation.orchestrator_enabled', 'boolean', 'Orchestrator mode', 'Allow subagents to delegate further.', {
      defaultScope: 'global',
      category: 'delegation',
    }),

    // ── Skills ────────────────────────────────────────
    setting('skills.inline_shell', 'boolean', 'Inline shell', 'Auto-expose shell commands from loaded skills.', {
      defaultScope: 'global',
      category: 'skills',
    }),
    setting('skills.inline_shell_timeout', 'number', 'Shell timeout', 'Seconds before killing inline shell commands.', {
      defaultScope: 'global',
      category: 'skills',
    }),

    // ── Security ──────────────────────────────────────
    setting('security.allow_private_urls', 'boolean', 'Allow private URLs', 'Permit fetching non-public URLs.', {
      defaultScope: 'global',
      category: 'security',
      risk: 'risky',
    }),
    setting('security.redact_secrets', 'boolean', 'Redact secrets', 'Strip secrets from logs and output.', {
      defaultScope: 'global',
      category: 'security',
      risk: 'security-sensitive',
    }),
  ],
  getSettingsPath(scope: AgentSettingsScope): string {
    if (scope !== 'global') {
      throw new Error('Hermes settings only support global scope. Use --global.');
    }
    return expandTilde('~/.hermes/config.yaml');
  },
};
