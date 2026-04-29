import * as TOML from '@iarna/toml';
import { parse as parseJsonc, type ParseError } from 'jsonc-parser';
import { readFileIfExists, writeFile } from '../../utils/fs.js';
import { getEffectiveAgentSettingsDefaultScopeSync } from '../userConfig.js';
import { parseAgentSettingValue } from './valueParser.js';
import { getAgentSettingDefinition, getAgentSettingsAdapter, getAgentSettingsAdapters, toSchemaEntry } from './registry.js';
import type {
  AgentSettingDefinition,
  AgentApiKeyAction,
  AgentApiKeyOptions,
  AgentApiKeyResult,
  AgentApiKeyStatus,
  AgentHookAddOptions,
  AgentHookEntry,
  AgentHookCommand,
  AgentHookEvent,
  AgentHookMatcher,
  AgentHookRemoveOptions,
  AgentHookWriteResult,
  AgentSettingReadOptions,
  AgentSettingsSchema,
  AgentSettingsScope,
  AgentSettingSetOptions,
  AgentSettingsWriteResult,
} from './types.js';

type JsonObject = Record<string, unknown>;
type RegisteredAgentSettingsAdapter = NonNullable<ReturnType<typeof getAgentSettingsAdapter>>;

const HOOK_EVENT_ALIASES: Record<string, AgentHookEvent> = {
  'pre-tool-use': 'PreToolUse',
  'before-tool-use': 'PreToolUse',
  'post-tool-use': 'PostToolUse',
  'after-tool-use': 'PostToolUse',
  'post-tool-use-failure': 'PostToolUseFailure',
  notification: 'Notification',
  'permission-request': 'PermissionRequest',
  stop: 'Stop',
  'session-start': 'SessionStart',
  'session-end': 'SessionEnd',
  'user-prompt-submit': 'UserPromptSubmit',
};

const HOOK_EVENTS = new Set<AgentHookEvent>(Object.values(HOOK_EVENT_ALIASES));

const CLAUDE_API_KEY_RESPONSES_DEFINITION: AgentSettingDefinition = {
  agent: 'claude',
  key: 'customApiKeyResponses',
  nativePath: ['customApiKeyResponses'],
  title: 'Custom API key responses',
  description: 'Remembered custom API key trust responses.',
  valueType: 'object',
  scopes: ['global'],
  defaultScope: 'global',
  category: 'auth',
  risk: 'security-sensitive',
  store: 'globalConfig',
};

function assertObject(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} contains JSON that is not an object.`);
  }
  return value as JsonObject;
}

function getNestedValue(config: JsonObject, path: string[]): unknown {
  let current: unknown = config;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonObject)[segment];
  }
  return current;
}

function setNestedValue(config: JsonObject, path: string[], value: unknown): void {
  let current = config;
  for (const segment of path.slice(0, -1)) {
    const next = current[segment];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as JsonObject;
  }
  current[path[path.length - 1]!] = value;
}

function normalizeHookEvent(event: string): AgentHookEvent {
  const exact = event as AgentHookEvent;
  if (HOOK_EVENTS.has(exact)) {
    return exact;
  }

  const normalized = event.trim().replace(/_/g, '-').toLowerCase();
  const mapped = HOOK_EVENT_ALIASES[normalized];
  if (mapped) {
    return mapped;
  }

  throw new Error(`Unsupported hook event: ${event}. Supported: ${[...HOOK_EVENTS].join(', ')}.`);
}

function assertHookMatchers(value: unknown): AgentHookMatcher[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('Existing hooks value is not an array.');
  }

  return value.map((entry): AgentHookMatcher => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Existing hook matcher is not an object.');
    }

    const entryObject = entry as JsonObject;
    const matcher = entryObject.matcher;
    const hooks = entryObject.hooks;
    if (matcher !== undefined && typeof matcher !== 'string') {
      throw new Error('Existing hook matcher must be a string.');
    }
    if (!Array.isArray(hooks)) {
      throw new Error('Existing hook commands must be an array.');
    }

    return {
      ...entryObject,
      ...(matcher !== undefined ? { matcher } : {}),
      hooks: hooks.map((hook): AgentHookEntry => {
        if (!hook || typeof hook !== 'object' || Array.isArray(hook)) {
          throw new Error('Existing hook command is not an object.');
        }
        const hookObject = hook as JsonObject;
        const type = hookObject.type;
        const command = hookObject.command;
        const name = hookObject.name;
        if (type !== undefined && typeof type !== 'string') {
          throw new Error('Existing hook command type must be a string when present.');
        }
        if (command !== undefined && typeof command !== 'string') {
          throw new Error('Existing hook command must be a string when present.');
        }
        if (name !== undefined && typeof name !== 'string') {
          throw new Error('Existing hook name must be a string when present.');
        }

        return {
          ...hookObject,
          ...(typeof type === 'string' ? { type } : {}),
          ...(typeof command === 'string' ? { command } : {}),
          ...(typeof name === 'string' ? { name } : {}),
        };
      }),
    };
  });
}

function getHookMatchers(config: JsonObject, event: AgentHookEvent): AgentHookMatcher[] {
  const hooks = getNestedValue(config, ['hooks']);
  if (hooks === undefined) {
    return [];
  }
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
    throw new Error('Existing hooks value is not an object.');
  }
  return assertHookMatchers((hooks as JsonObject)[event]);
}

function setHookMatchers(config: JsonObject, event: AgentHookEvent, matchers: AgentHookMatcher[]): void {
  const hooks = getNestedValue(config, ['hooks']);
  if (hooks !== undefined && (!hooks || typeof hooks !== 'object' || Array.isArray(hooks))) {
    throw new Error('Existing hooks value is not an object.');
  }

  const hooksObject = hooks as JsonObject | undefined;
  const nextHooks = hooksObject ?? {};
  if (matchers.length === 0) {
    delete nextHooks[event];
  } else {
    nextHooks[event] = matchers;
  }

  if (Object.keys(nextHooks).length === 0) {
    deleteNestedValue(config, ['hooks']);
    return;
  }

  setNestedValue(config, ['hooks'], nextHooks);
}

function buildHookCommand(command: string, name?: string): AgentHookCommand {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('Hook command cannot be empty.');
  }
  return {
    type: 'command',
    command: trimmed,
    ...(name ? { name } : {}),
  };
}

function normalizeApiKeyForConfig(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error('API key cannot be empty.');
  }
  return trimmed.slice(-20);
}

function getApiKeyResponses(config: JsonObject): { approved: string[]; rejected: string[] } {
  const current = config.customApiKeyResponses;
  if (current !== undefined && (!current || typeof current !== 'object' || Array.isArray(current))) {
    throw new Error('Existing customApiKeyResponses value is not an object.');
  }

  const responses = (current ?? {}) as JsonObject;
  const approved = responses.approved ?? [];
  const rejected = responses.rejected ?? [];

  if (!Array.isArray(approved) || !approved.every(value => typeof value === 'string')) {
    throw new Error('Existing customApiKeyResponses.approved value must be an array of strings.');
  }
  if (!Array.isArray(rejected) || !rejected.every(value => typeof value === 'string')) {
    throw new Error('Existing customApiKeyResponses.rejected value must be an array of strings.');
  }

  return {
    approved,
    rejected,
  };
}

function getApiKeyStatusFromResponses(responses: { approved: string[]; rejected: string[] }, fingerprint: string): AgentApiKeyStatus {
  if (responses.approved.includes(fingerprint)) {
    return 'approved';
  }
  if (responses.rejected.includes(fingerprint)) {
    return 'rejected';
  }
  return 'unknown';
}

function setApiKeyResponses(config: JsonObject, approved: string[], rejected: string[]): void {
  config.customApiKeyResponses = {
    ...(config.customApiKeyResponses && typeof config.customApiKeyResponses === 'object' && !Array.isArray(config.customApiKeyResponses)
      ? config.customApiKeyResponses as JsonObject
      : {}),
    approved,
    rejected,
  };
}

function deleteNestedValue(config: JsonObject, path: string[]): boolean {
  const parents: Array<{ object: JsonObject; key: string }> = [];
  let current: unknown = config;

  for (const segment of path.slice(0, -1)) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return false;
    }
    parents.push({ object: current as JsonObject, key: segment });
    current = (current as JsonObject)[segment];
  }

  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    return false;
  }

  const finalKey = path[path.length - 1]!;
  if (!(finalKey in current)) {
    return false;
  }

  delete (current as JsonObject)[finalKey];

  for (let i = parents.length - 1; i >= 0; i--) {
    const { object, key } = parents[i]!;
    const value = object[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      delete object[key];
    } else {
      break;
    }
  }

  return true;
}

function resolveProjectPath(projectPath?: string): string {
  return projectPath ?? process.cwd();
}

function resolveScope(definition: AgentSettingDefinition, scope?: AgentSettingsScope): AgentSettingsScope {
  const defaultScope = getEffectiveAgentSettingsDefaultScopeSync();
  const resolvedScope = scope ?? (definition.store === 'globalConfig' && !definition.scopes.includes(defaultScope) ? definition.defaultScope : defaultScope);
  if (!definition.scopes.includes(resolvedScope)) {
    throw new Error(`"${definition.key}" does not support ${resolvedScope} scope. Supported scopes: ${definition.scopes.join(', ')}.`);
  }
  return resolvedScope;
}

function getSupportedSettingScopes(adapter: RegisteredAgentSettingsAdapter): AgentSettingsScope[] {
  return [...new Set(adapter.definitions.flatMap(definition => definition.scopes))];
}

function resolveFullReadScope(adapter: RegisteredAgentSettingsAdapter, scope?: AgentSettingsScope): AgentSettingsScope {
  const resolvedScope = scope ?? getEffectiveAgentSettingsDefaultScopeSync();
  const supportedScopes = getSupportedSettingScopes(adapter);
  if (!supportedScopes.includes(resolvedScope)) {
    throw new Error(`Agent ${adapter.agent} settings do not support ${resolvedScope} scope. Supported scopes: ${supportedScopes.join(', ')}.`);
  }
  return resolvedScope;
}

async function readConfigObject(adapter: RegisteredAgentSettingsAdapter, path: string): Promise<JsonObject> {
  const content = await readFileIfExists(path);
  if (!content) {
    return {};
  }

  if (adapter.format === 'toml') {
    try {
      return assertObject(TOML.parse(content), path);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof Error) {
        throw new Error(`${path} contains invalid TOML.`);
      }
      throw error;
    }
  }

  try {
    const errors: ParseError[] = [];
    const value = adapter.format === 'jsonc'
      ? parseJsonc(content, errors, { allowTrailingComma: true })
      : JSON.parse(content);
    if (errors.length > 0) {
      throw new SyntaxError('Invalid JSONC');
    }
    return assertObject(value, path);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${path} contains invalid ${adapter.format === 'jsonc' ? 'JSONC' : 'JSON'}.`);
    }
    throw error;
  }
}

function stringifyConfigObject(adapter: RegisteredAgentSettingsAdapter, config: JsonObject): string {
  if (adapter.format === 'toml') {
    return TOML.stringify(config as TOML.JsonMap);
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

async function writeConfigObject(adapter: RegisteredAgentSettingsAdapter, path: string, config: JsonObject): Promise<void> {
  await writeFile(path, stringifyConfigObject(adapter, config));
}

function assertHookEventSupported(adapter: RegisteredAgentSettingsAdapter, event: AgentHookEvent): void {
  if (adapter.hookEvents && !adapter.hookEvents.includes(event)) {
    throw new Error(`Agent ${adapter.agent} does not support ${event} hooks. Supported: ${adapter.hookEvents.join(', ')}.`);
  }
}

function resolveHookScope(adapter: RegisteredAgentSettingsAdapter, scope?: AgentSettingsScope): AgentSettingsScope {
  const resolvedScope = scope ?? getEffectiveAgentSettingsDefaultScopeSync();
  const supportedScopes = adapter.hookScopes ?? ['global', 'project', 'local'];
  if (!supportedScopes.includes(resolvedScope)) {
    throw new Error(`Agent ${adapter.agent} hooks do not support ${resolvedScope} scope. Supported scopes: ${supportedScopes.join(', ')}.`);
  }
  return resolvedScope;
}

export class AgentSettingsManager {
  getSupportedAgents(): string[] {
    return getAgentSettingsAdapters().map(adapter => adapter.agent);
  }

  getSchema(agent: string): AgentSettingsSchema {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }

    return {
      agent: adapter.agent,
      displayName: adapter.displayName,
      effectiveDefaultScope: getEffectiveAgentSettingsDefaultScopeSync(),
      settings: adapter.definitions.map(toSchemaEntry),
    };
  }

  async get(agent: string, key?: string, options: AgentSettingReadOptions = {}): Promise<unknown> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }

    if (!key) {
      const scope = resolveFullReadScope(adapter, options.scope);
      const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
      const config = await readConfigObject(adapter, path);

      if (scope !== 'global') {
        return config;
      }

      const globalConfigDefinitions = adapter.definitions.filter(definition => definition.store === 'globalConfig' && definition.scopes.includes('global'));
      if (globalConfigDefinitions.length === 0) {
        return config;
      }

      const globalConfigPath = adapter.getSettingsPath('global', resolveProjectPath(options.projectPath), globalConfigDefinitions[0]);
      const globalConfig = await readConfigObject(adapter, globalConfigPath);
      const result = { ...config };
      for (const definition of globalConfigDefinitions) {
        const value = getNestedValue(globalConfig, definition.nativePath);
        if (value !== undefined) {
          setNestedValue(result, definition.nativePath, value);
        }
      }

      return result;
    }

    const definition = getAgentSettingDefinition(agent, key);
    if (!definition) {
      throw new Error(`Unknown ${agent} setting: ${key}.`);
    }

    const scope = resolveScope(definition, options.scope);
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath), definition);
    const config = await readConfigObject(adapter, path);
    return getNestedValue(config, definition.nativePath);
  }

  async set(
    agent: string,
    key: string,
    rawValue: string,
    options: AgentSettingSetOptions = {},
  ): Promise<AgentSettingsWriteResult> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }

    const definition = getAgentSettingDefinition(agent, key);
    if (!definition) {
      throw new Error(`Unknown ${agent} setting: ${key}.`);
    }

    const scope = resolveScope(definition, options.scope);
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath), definition);
    const config = await readConfigObject(adapter, path);
    const previousValue = getNestedValue(config, definition.nativePath);
    const value = parseAgentSettingValue(definition, rawValue, options.parseJson);

    setNestedValue(config, definition.nativePath, value);

    if (!options.dryRun) {
      await writeConfigObject(adapter, path, config);
    }

    return {
      agent,
      key,
      scope,
      path,
      value,
      previousValue,
      dryRun: Boolean(options.dryRun),
    };
  }

  async unset(agent: string, key: string, options: AgentSettingSetOptions = {}): Promise<AgentSettingsWriteResult> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }

    const definition = getAgentSettingDefinition(agent, key);
    if (!definition) {
      throw new Error(`Unknown ${agent} setting: ${key}.`);
    }

    const scope = resolveScope(definition, options.scope);
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath), definition);
    const config = await readConfigObject(adapter, path);
    const previousValue = getNestedValue(config, definition.nativePath);

    deleteNestedValue(config, definition.nativePath);

    if (!options.dryRun) {
      await writeConfigObject(adapter, path, config);
    }

    return {
      agent,
      key,
      scope,
      path,
      previousValue,
      dryRun: Boolean(options.dryRun),
    };
  }

  async listHooks(agent: string, event?: string, options: AgentSettingReadOptions = {}): Promise<Record<string, AgentHookMatcher[]> | AgentHookMatcher[]> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }
    if (!adapter.hookEvents) {
      throw new Error(`Agent ${agent} does not support hook management.`);
    }
    const hookEvent = event ? normalizeHookEvent(event) : undefined;
    if (hookEvent) {
      assertHookEventSupported(adapter, hookEvent);
    }

    const scope = resolveHookScope(adapter, options.scope);
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readConfigObject(adapter, path);

    if (hookEvent) {
      return getHookMatchers(config, hookEvent);
    }

    const hooks = getNestedValue(config, ['hooks']);
    if (hooks === undefined) {
      return {};
    }
    if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
      throw new Error('Existing hooks value is not an object.');
    }

    const result: Record<string, AgentHookMatcher[]> = {};
    for (const [hookEvent, value] of Object.entries(hooks)) {
      result[hookEvent] = assertHookMatchers(value);
    }
    return result;
  }

  async addHook(
    agent: string,
    event: string,
    command: string,
    options: AgentHookAddOptions = {},
  ): Promise<AgentHookWriteResult> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }
    if (!adapter.hookEvents) {
      throw new Error(`Agent ${agent} does not support hook management.`);
    }

    const hookEvent = normalizeHookEvent(event);
    assertHookEventSupported(adapter, hookEvent);
    const scope = resolveHookScope(adapter, options.scope);
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readConfigObject(adapter, path);
    const hook = buildHookCommand(command, options.name);
    const matchers = getHookMatchers(config, hookEvent);
    const matcher = options.matcher ?? '*';
    const existingMatcher = matchers.find(entry => (entry.matcher ?? '*') === matcher);

    if (existingMatcher) {
      existingMatcher.hooks.push(hook);
    } else {
      matchers.push({
        ...(matcher === '*' ? {} : { matcher }),
        hooks: [hook],
      });
    }

    setHookMatchers(config, hookEvent, matchers);

    if (!options.dryRun) {
      await writeConfigObject(adapter, path, config);
    }

    return {
      agent,
      event: hookEvent,
      scope,
      path,
      hook,
      dryRun: Boolean(options.dryRun),
    };
  }

  async removeHook(
    agent: string,
    event: string,
    commandOrName: string,
    options: AgentHookRemoveOptions = {},
  ): Promise<AgentHookWriteResult> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }
    if (!adapter.hookEvents) {
      throw new Error(`Agent ${agent} does not support hook management.`);
    }

    const hookEvent = normalizeHookEvent(event);
    assertHookEventSupported(adapter, hookEvent);
    const scope = resolveHookScope(adapter, options.scope);
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readConfigObject(adapter, path);
    const matchers = getHookMatchers(config, hookEvent);
    let removed = 0;

    const nextMatchers = matchers
      .map((entry): AgentHookMatcher => {
        if (options.matcher !== undefined && (entry.matcher ?? '*') !== options.matcher) {
          return entry;
        }

        const hooks = entry.hooks.filter(hook => {
          const matches = hook.name === commandOrName || hook.command === commandOrName;
          if (matches) {
            removed++;
          }
          return !matches;
        });

        return { ...entry, hooks };
      })
      .filter(entry => entry.hooks.length > 0);

    setHookMatchers(config, hookEvent, nextMatchers);

    if (!options.dryRun) {
      await writeConfigObject(adapter, path, config);
    }

    return {
      agent,
      event: hookEvent,
      scope,
      path,
      removed,
      dryRun: Boolean(options.dryRun),
    };
  }

  async getApiKeyStatus(agent: string, apiKey: string, options: AgentApiKeyOptions = {}): Promise<AgentApiKeyResult> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }
    if (agent !== 'claude') {
      throw new Error(`Agent ${agent} does not support API key trust management.`);
    }

    const path = adapter.getSettingsPath('global', resolveProjectPath(options.projectPath), CLAUDE_API_KEY_RESPONSES_DEFINITION);
    const config = await readConfigObject(adapter, path);
    const fingerprint = normalizeApiKeyForConfig(apiKey);
    const responses = getApiKeyResponses(config);

    return {
      agent,
      path,
      fingerprint,
      status: getApiKeyStatusFromResponses(responses, fingerprint),
      dryRun: false,
    };
  }

  async updateApiKeyTrust(agent: string, action: AgentApiKeyAction, apiKey: string, options: AgentApiKeyOptions = {}): Promise<AgentApiKeyResult> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }
    if (agent !== 'claude') {
      throw new Error(`Agent ${agent} does not support API key trust management.`);
    }

    const path = adapter.getSettingsPath('global', resolveProjectPath(options.projectPath), CLAUDE_API_KEY_RESPONSES_DEFINITION);
    const config = await readConfigObject(adapter, path);
    const fingerprint = normalizeApiKeyForConfig(apiKey);
    const responses = getApiKeyResponses(config);
    const previousStatus = getApiKeyStatusFromResponses(responses, fingerprint);
    let approved = responses.approved.filter(value => value !== fingerprint);
    let rejected = responses.rejected.filter(value => value !== fingerprint);

    if (action === 'approve') {
      approved = [...approved, fingerprint];
    } else if (action === 'reject') {
      rejected = [...rejected, fingerprint];
    }

    const status: AgentApiKeyStatus = action === 'approve'
      ? 'approved'
      : action === 'reject'
        ? 'rejected'
        : 'unknown';

    setApiKeyResponses(config, approved, rejected);

    if (!options.dryRun) {
      await writeConfigObject(adapter, path, config);
    }

    return {
      agent,
      path,
      fingerprint,
      status,
      previousStatus,
      dryRun: Boolean(options.dryRun),
    };
  }
}
