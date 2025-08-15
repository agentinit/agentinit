export interface AgentConfig {
  name: string;
  files: string[];
  configPath?: string;
  detected: boolean;
}

export interface StackInfo {
  language: string;
  framework?: string;
  packageManager?: string;
  dependencies: string[];
  testFramework?: string;
}

export interface ProjectConfig {
  name: string;
  stack: StackInfo;
  agents: AgentConfig[];
  preferences: ProjectPreferences;
}

export interface ProjectPreferences {
  alwaysUseGit: boolean;
  alwaysWriteTests: boolean;
  testFramework: string;
  commitStyle: 'conventional' | 'standard';
  runDevServer: boolean;
}

export interface MCPItem {
  name: string;
  category: string;
  description: string;
  stackCompatibility: string[];
  installCommand: string;
  agentInstructions: string;
  popularity: number;
  verified: boolean;
}

export interface MCPRegistry {
  mcps: MCPItem[];
}

export interface GlobalConfig {
  defaults: ProjectPreferences;
  mcpPreferences: {
    autoInstall: string[];
  };
}

export interface SubAgent {
  name: string;
  role: string;
  responsibilities: string[];
  stackSpecificRules: Record<string, string[]>;
  tools: string[];
}

export interface AgentTemplate {
  frontmatter: {
    targets?: string[];
    priority?: 'high' | 'medium' | 'low';
  };
  content: string;
}

export interface DetectionResult {
  agents: AgentConfig[];
  stack: StackInfo;
}