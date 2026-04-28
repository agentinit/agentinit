import { readFileIfExists, writeFile } from '../../utils/fs.js';
import { getEffectiveAgentSettingsDefaultScopeSync } from '../userConfig.js';
import { parseAgentSettingValue } from './valueParser.js';
import { getAgentSettingDefinition, getAgentSettingsAdapter, getAgentSettingsAdapters, toSchemaEntry } from './registry.js';
import type {
  AgentSettingDefinition,
  AgentHookAddOptions,
  AgentHookEntry,
  AgentHookCommand,
  AgentHookEvent,
  AgentHookMatcher,
  AgentHookRemoveOptions,
  AgentHookWriteResult,
  AgentSettingReadOptions,
  AgentSettingsScope,
  AgentSettingSetOptions,
  AgentSettingsWriteResult,
} from './types.js';

type JsonObject = Record<string, unknown>;

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
};

const HOOK_EVENTS = new Set<AgentHookEvent>(Object.values(HOOK_EVENT_ALIASES));

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
  const resolvedScope = scope ?? getEffectiveAgentSettingsDefaultScopeSync();
  if (!definition.scopes.includes(resolvedScope)) {
    throw new Error(`"${definition.key}" does not support ${resolvedScope} scope. Supported scopes: ${definition.scopes.join(', ')}.`);
  }
  return resolvedScope;
}

async function readJsonObject(path: string): Promise<JsonObject> {
  const content = await readFileIfExists(path);
  if (!content) {
    return {};
  }

  try {
    return assertObject(JSON.parse(content), path);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${path} contains invalid JSON.`);
    }
    throw error;
  }
}

export class AgentSettingsManager {
  getSupportedAgents(): string[] {
    return getAgentSettingsAdapters().map(adapter => adapter.agent);
  }

  getSchema(agent: string) {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }

    return {
      agent: adapter.agent,
      displayName: adapter.displayName,
      settings: adapter.definitions.map(toSchemaEntry),
    };
  }

  async get(agent: string, key?: string, options: AgentSettingReadOptions = {}): Promise<unknown> {
    const adapter = getAgentSettingsAdapter(agent);
    if (!adapter) {
      throw new Error(`Unsupported agent settings adapter: ${agent}. Supported: ${this.getSupportedAgents().join(', ')}`);
    }

    if (!key) {
      const scope = options.scope ?? getEffectiveAgentSettingsDefaultScopeSync();
      const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
      return await readJsonObject(path);
    }

    const definition = getAgentSettingDefinition(agent, key);
    if (!definition) {
      throw new Error(`Unknown ${agent} setting: ${key}.`);
    }

    const scope = resolveScope(definition, options.scope);
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readJsonObject(path);
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
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readJsonObject(path);
    const previousValue = getNestedValue(config, definition.nativePath);
    const value = parseAgentSettingValue(definition, rawValue, options.parseJson);

    setNestedValue(config, definition.nativePath, value);

    if (!options.dryRun) {
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
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
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readJsonObject(path);
    const previousValue = getNestedValue(config, definition.nativePath);

    deleteNestedValue(config, definition.nativePath);

    if (!options.dryRun) {
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
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
    if (agent !== 'claude') {
      throw new Error(`Agent ${agent} does not support hook management.`);
    }

    const scope = options.scope ?? getEffectiveAgentSettingsDefaultScopeSync();
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readJsonObject(path);

    if (event) {
      return getHookMatchers(config, normalizeHookEvent(event));
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
    if (agent !== 'claude') {
      throw new Error(`Agent ${agent} does not support hook management.`);
    }

    const hookEvent = normalizeHookEvent(event);
    const scope = options.scope ?? getEffectiveAgentSettingsDefaultScopeSync();
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readJsonObject(path);
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
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
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
    if (agent !== 'claude') {
      throw new Error(`Agent ${agent} does not support hook management.`);
    }

    const hookEvent = normalizeHookEvent(event);
    const scope = options.scope ?? getEffectiveAgentSettingsDefaultScopeSync();
    const path = adapter.getSettingsPath(scope, resolveProjectPath(options.projectPath));
    const config = await readJsonObject(path);
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
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
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
}
