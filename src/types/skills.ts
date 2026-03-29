export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  generatedContent?: string;
}

export type SkillInstallMode = 'copy' | 'symlink';

export interface SkillInstallResult {
  path: string;
  canonicalPath?: string;
  mode: SkillInstallMode;
  symlinkFailed?: boolean;
}

export interface InstalledSkill {
  name: string;
  description: string;
  path: string;
  canonicalPath?: string;
  agent: string;
  scope: 'project' | 'global';
  isSymlink: boolean;
  mode: SkillInstallMode;
}

export interface SkillsAddOptions {
  global?: boolean;
  agents?: string[];
  skills?: string[];
  list?: boolean;
  copy?: boolean;
  yes?: boolean;
}

export interface SkillsAddResult {
  installed: Array<{ skill: SkillInfo; agent: string } & SkillInstallResult>;
  skipped: Array<{ skill: SkillInfo; reason: string }>;
}

export interface SkillsListOptions {
  global?: boolean;
  agents?: string[];
}

export interface SkillsRemoveOptions {
  global?: boolean;
  agents?: string[];
  yes?: boolean;
}

export interface SkillsRemoveResult {
  removed: string[];
  notFound: string[];
  skipped: Array<{ name: string; reason: string }>;
}

export interface SkillSource {
  type: 'github' | 'local';
  url?: string | undefined;
  path?: string | undefined;
  owner?: string | undefined;
  repo?: string | undefined;
}
