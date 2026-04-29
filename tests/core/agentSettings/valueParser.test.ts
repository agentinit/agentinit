import { describe, expect, it } from 'vitest';
import { getAgentSettingDefinition } from '../../../src/core/agentSettings/registry.js';
import { parseAgentSettingValue } from '../../../src/core/agentSettings/valueParser.js';

function getDefinition(key: string, agent = 'claude') {
  const definition = getAgentSettingDefinition(agent, key);
  if (!definition) {
    throw new Error(`Missing test definition for ${agent}.${key}.`);
  }
  return definition;
}

describe('parseAgentSettingValue', () => {
  it('parses boolean aliases', () => {
    expect(parseAgentSettingValue(getDefinition('alwaysThinkingEnabled'), 'yes')).toBe(true);
    expect(parseAgentSettingValue(getDefinition('alwaysThinkingEnabled'), '0')).toBe(false);
  });

  it('parses enum values and rejects unsupported values', () => {
    expect(parseAgentSettingValue(getDefinition('effortLevel'), 'high')).toBe('high');
    expect(() => parseAgentSettingValue(getDefinition('effortLevel'), 'turbo'))
      .toThrow('must be one of');
  });

  it('parses boolean-or-enum values', () => {
    const definition = getDefinition('autoupdate', 'opencode');

    expect(parseAgentSettingValue(definition, 'false')).toBe(false);
    expect(parseAgentSettingValue(definition, 'notify')).toBe('notify');
    expect(() => parseAgentSettingValue(definition, 'later'))
      .toThrow('must be one of');
  });

  it('parses positive integers and rejects other numbers', () => {
    const definition = getDefinition('tool_output.max_lines', 'opencode');

    expect(parseAgentSettingValue(definition, '5000')).toBe(5000);
    expect(() => parseAgentSettingValue(definition, '0'))
      .toThrow('positive integer');
    expect(() => parseAgentSettingValue(definition, '1.5'))
      .toThrow('positive integer');
  });

  it('parses arrays as a single string by default or full JSON with --value-json', () => {
    expect(parseAgentSettingValue(getDefinition('permissions.allow'), 'Bash(npm test)')).toEqual(['Bash(npm test)']);
    expect(parseAgentSettingValue(getDefinition('permissions.allow'), '["Bash(npm test)","Read"]', true))
      .toEqual(['Bash(npm test)', 'Read']);
  });

  it('requires explicit JSON parsing for object values', () => {
    expect(() => parseAgentSettingValue(getDefinition('env'), '{"A":"1"}'))
      .toThrow('Use --value-json');
    expect(parseAgentSettingValue(getDefinition('env'), '{"A":"1"}', true)).toEqual({ A: '1' });
  });
});
