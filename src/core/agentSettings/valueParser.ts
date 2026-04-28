import type { AgentSettingDefinition } from './types.js';

const TRUE_VALUES = new Set(['true', 'on', 'yes', '1']);
const FALSE_VALUES = new Set(['false', 'off', 'no', '0']);

function parseJsonValue(raw: string, key: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Value for "${key}" is not valid JSON.`);
  }
}

export function parseAgentSettingValue(
  definition: AgentSettingDefinition,
  raw: string,
  parseJson = false,
): unknown {
  switch (definition.valueType) {
    case 'string':
      return raw;

    case 'boolean': {
      const normalized = raw.trim().toLowerCase();
      if (TRUE_VALUES.has(normalized)) {
        return true;
      }
      if (FALSE_VALUES.has(normalized)) {
        return false;
      }
      throw new Error(`Value for "${definition.key}" must be one of: on, off, true, false, yes, no, 1, 0.`);
    }

    case 'number': {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`Value for "${definition.key}" must be a finite number.`);
      }
      return value;
    }

    case 'enum': {
      if (!definition.allowedValues?.includes(raw)) {
        throw new Error(`Value for "${definition.key}" must be one of: ${definition.allowedValues?.join(', ')}.`);
      }
      return raw;
    }

    case 'array': {
      if (parseJson) {
        const value = parseJsonValue(raw, definition.key);
        if (!Array.isArray(value)) {
          throw new Error(`JSON value for "${definition.key}" must be an array.`);
        }
        return value;
      }
      return [raw];
    }

    case 'object': {
      if (!parseJson) {
        throw new Error(`Value for "${definition.key}" must be valid JSON. Use --value-json when setting it from the CLI.`);
      }
      const value = parseJsonValue(raw, definition.key);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`JSON value for "${definition.key}" must be an object.`);
      }
      return value;
    }
  }
}
