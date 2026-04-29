export type AgentSettingsScope = 'global' | 'project' | 'local';

export type AgentSettingValueType = 'string' | 'boolean' | 'number' | 'enum' | 'array' | 'object';

export type AgentSettingRisk = 'safe' | 'risky' | 'security-sensitive' | 'deprecated';

export interface AgentSettingDefinition {
  agent: string;
  key: string;
  nativePath: string[];
  title: string;
  description: string;
  valueType: AgentSettingValueType;
  scopes: AgentSettingsScope[];
  defaultScope: AgentSettingsScope;
  allowedValues?: string[];
  category: string;
  risk: AgentSettingRisk;
  deprecated?: boolean;
  replacement?: string;
}

export interface AgentSettingsAdapter {
  agent: string;
  displayName: string;
  definitions: AgentSettingDefinition[];
  getSettingsPath(scope: AgentSettingsScope, projectPath: string): string;
  format?: 'json' | 'yaml';
}

export interface AgentSettingSchemaEntry extends Omit<AgentSettingDefinition, 'nativePath'> {
  nativePath: string;
}

export interface AgentSettingsSchema {
  agent: string;
  displayName: string;
  effectiveDefaultScope: AgentSettingsScope;
  settings: AgentSettingSchemaEntry[];
}

export interface AgentSettingSetOptions {
  scope?: AgentSettingsScope;
  parseJson?: boolean;
  dryRun?: boolean;
  projectPath?: string;
}

export interface AgentSettingReadOptions {
  scope?: AgentSettingsScope;
  projectPath?: string;
}

export interface AgentSettingsWriteResult {
  agent: string;
  key: string;
  scope: AgentSettingsScope;
  path: string;
  value?: unknown;
  previousValue?: unknown;
  dryRun: boolean;
}

export type AgentHookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'PermissionRequest'
  | 'Stop'
  | 'SessionStart'
  | 'SessionEnd';

export interface AgentHookAddOptions {
  scope?: AgentSettingsScope;
  projectPath?: string;
  matcher?: string;
  name?: string;
  dryRun?: boolean;
}

export interface AgentHookRemoveOptions {
  scope?: AgentSettingsScope;
  projectPath?: string;
  matcher?: string;
  dryRun?: boolean;
}

export interface AgentHookEntry {
  type?: string;
  command?: string;
  name?: string;
  [key: string]: unknown;
}

export interface AgentHookCommand {
  type: 'command';
  command: string;
  name?: string;
  [key: string]: unknown;
}

export interface AgentHookMatcher {
  matcher?: string;
  hooks: AgentHookEntry[];
  [key: string]: unknown;
}

export interface AgentHookWriteResult {
  agent: string;
  event: AgentHookEvent;
  scope: AgentSettingsScope;
  path: string;
  hook?: AgentHookCommand;
  removed?: number;
  dryRun: boolean;
}
