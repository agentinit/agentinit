export type LockEntryKind = 'skill' | 'mcp' | 'rules';
export type LockAction = 'install' | 'update' | 'remove';

export interface LockSource {
  type: 'marketplace' | 'github' | 'gitlab' | 'bitbucket' | 'local';
  marketplace?: string;
  pluginName?: string;
  prefix?: string;
  url?: string;
  path?: string;
  owner?: string;
  repo?: string;
  subpath?: string;
}

export interface LockSkillMeta {
  kind: 'skill';
  installPath: string;
  canonicalPath?: string;
  mode: 'copy' | 'symlink';
}

export interface LockMcpMeta {
  kind: 'mcp';
  configPath: string;
  serverType: 'stdio' | 'http' | 'sse';
  command?: string;
  url?: string;
}

export interface LockRulesMeta {
  kind: 'rules';
  configPath: string;
  templateIds: string[];
  ruleCount: number;
}

export type LockEntryMeta = LockSkillMeta | LockMcpMeta | LockRulesMeta;

export interface LockEntry {
  id: string;
  kind: LockEntryKind;
  action: LockAction;
  name: string;
  projectPath: string;
  agents: string[];
  scope: 'project' | 'global';
  timestamp: string;
  source: LockSource;
  contentHash?: string;
  metadata: LockEntryMeta;
}

export interface LockState {
  version: 1;
  entries: LockEntry[];
}

export interface LockQueryOptions {
  kind?: LockEntryKind;
  name?: string;
  projectPath?: string;
  agent?: string;
  scope?: 'project' | 'global';
  action?: LockAction;
}

export interface LockPruneResult {
  prunedProjects: string[];
  entriesRemoved: number;
}

export interface LockDriftResult {
  entry: LockEntry;
  status: 'match' | 'drift' | 'missing';
  currentHash?: string;
}
