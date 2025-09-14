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

export interface RuleSection {
  templateId: string;
  templateName: string;
  rules: string[];
}

export interface AppliedRules {
  templateRules: string[];
  rawRules: string[];
  fileRules: string[];
  remoteRules: string[];
  merged: string[];
  sections: RuleSection[];
}

export interface RuleApplicationResult {
  success: boolean;
  rulesApplied: number;
  agent: string;
  configPath: string;
  tokenCount?: number;
  tokenDiff?: number;
  totalFileTokens?: number;
  errors?: string[];
  existingRules?: string[];
  newlyApplied?: string[];
  existingCount?: number;
  newlyAppliedCount?: number;
  mergedSections?: RuleSection[];
}