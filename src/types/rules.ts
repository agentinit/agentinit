export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  rules: string[];
  category: 'workflow' | 'quality' | 'testing' | 'documentation';
  priority?: number;
}

export interface RulesConfig {
  templates: string[];
  rawRules: string[];
  fileRules?: string;
  remoteRules?: { url: string; auth?: string };
}

export interface RemoteRulesOptions {
  url: string;
  auth?: string;
  timeout?: number;
}

export interface AppliedRules {
  templateRules: string[];
  rawRules: string[];
  fileRules: string[];
  remoteRules: string[];
  merged: string[];
}

export interface RuleApplicationResult {
  success: boolean;
  rulesApplied: number;
  agent: string;
  configPath: string;
  errors?: string[];
}