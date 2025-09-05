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

export enum MCPServerType {
  STDIO = 'stdio',
  HTTP = 'http',
  SSE = 'sse'
}

export interface MCPServerConfig {
  name: string;
  type: MCPServerType;
  command?: string | undefined;
  args?: string[] | undefined;
  url?: string | undefined;
  env?: Record<string, string> | undefined;
  headers?: Record<string, string> | undefined;
}

export interface MCPCommandParsed {
  servers: MCPServerConfig[];
}

export interface TomlMCPServer {
  command?: string | undefined;
  args?: string[] | undefined;
  url?: string | undefined;
  env?: Record<string, string> | undefined;
  headers?: Record<string, string> | undefined;
}

// Agent-related interfaces
export interface AgentCapabilities {
  mcp: {
    stdio: boolean;
    http: boolean;
    sse: boolean;
  };
  rules: boolean;
  hooks: boolean;
  commands: boolean;
  subagents: boolean;
  statusline: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  url?: string;
  capabilities: AgentCapabilities;
  configFiles: string[];
  nativeConfigPath: string;
  globalConfigPath?: string;
  globalConfigPaths?: {
    windows?: string;
    darwin?: string;
    linux?: string;
  };
}

export interface AgentDetectionResult {
  agent: import('../agents/Agent.js').Agent;
  configPath: string;
}

export interface FilteredMCPConfig {
  servers: MCPServerConfig[];
  transformations: MCPTransformation[];
}

export interface MCPTransformation {
  original: MCPServerConfig;
  transformed: MCPServerConfig;
  reason: string;
}