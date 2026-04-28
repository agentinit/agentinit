import { describe, expect, it } from 'vitest';
import { getAgentSettingDefinition } from '../../../src/core/agentSettings/registry.js';
import { parseAgentSettingValue } from '../../../src/core/agentSettings/valueParser.js';

function getDefinition(key: string) {
  const definition = getAgentSettingDefinition('claude', key);
  if (!definition) {
    throw new Error(`Missing test definition for ${key}.`);
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
