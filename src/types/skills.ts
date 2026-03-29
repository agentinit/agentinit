export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  generatedContent?: string;
}

export interface InstalledSkill {
  name: string;
  description: string;
  path: string;
  agent: string;
  scope: 'project' | 'global';
  isSymlink: boolean;
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
  installed: Array<{ skill: SkillInfo; agent: string; path: string }>;
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

export interface SkillSource {
  type: 'github' | 'local';
  url?: string | undefined;
  path?: string | undefined;
  owner?: string | undefined;
  repo?: string | undefined;
}
