import { claudeSettingsAdapter } from './adapters/claude.js';
import type { AgentSettingsAdapter, AgentSettingDefinition, AgentSettingSchemaEntry } from './types.js';

const ADAPTERS: AgentSettingsAdapter[] = [
  claudeSettingsAdapter,
];

export function getAgentSettingsAdapters(): AgentSettingsAdapter[] {
  return [...ADAPTERS];
}

export function getAgentSettingsAdapter(agent: string): AgentSettingsAdapter | undefined {
  return ADAPTERS.find(adapter => adapter.agent === agent);
}

export function getAgentSettingDefinition(agent: string, key: string): AgentSettingDefinition | undefined {
  return getAgentSettingsAdapter(agent)?.definitions.find(definition => definition.key === key);
}

export function toSchemaEntry(definition: AgentSettingDefinition): AgentSettingSchemaEntry {
  return {
    ...definition,
    nativePath: definition.nativePath.join('.'),
  };
}
