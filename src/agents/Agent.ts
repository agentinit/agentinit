import { resolve } from 'path';
import { pathExists } from '../utils/fs.js';
import { getFullGlobalConfigPath } from '../utils/paths.js';
import { RulesApplicator } from '../core/rulesApplicator.js';
import type { 
  AgentDefinition, 
  MCPServerConfig, 
  AgentDetectionResult,
  ConfigFileDefinition
} from '../types/index.js';
import type { AppliedRules, RuleApplicationResult, RuleSection } from '../types/rules.js';

/**
 * Abstract base class for AI coding agents
 * Defines the common interface and behavior for all supported agents
 */
export abstract class Agent {
  protected definition: AgentDefinition;

  constructor(definition: AgentDefinition) {
    this.definition = definition;
  }

  /**
   * Get the agent's unique identifier
   */
  get id(): string {
    return this.definition.id;
  }

  /**
   * Get the agent's human-readable name
   */
  get name(): string {
    return this.definition.name;
  }

  /**
   * Get the agent's capabilities
   */
  get capabilities() {
    return this.definition.capabilities;
  }

  /**
   * Get the agent's configuration files to check for presence
   */
  get configFiles(): ConfigFileDefinition[] {
    return this.definition.configFiles;
  }

  /**
   * Get the agent's configuration file paths (backward compatibility)
   */
  get configFilePaths(): string[] {
    return this.definition.configFiles.map(config => config.path);
  }

  /**
   * Get the native configuration path for this agent
   */
  get nativeConfigPath(): string {
    return this.definition.nativeConfigPath;
  }

  /**
   * Detect if this agent is present in the given project path
   */
  async detectPresence(projectPath: string): Promise<AgentDetectionResult | null> {
    for (const configFile of this.configFiles) {
      const fullPath = resolve(projectPath, configFile.path);
      if (await pathExists(fullPath, configFile.type)) {
        return {
          agent: this,
          configPath: fullPath
        };
      }
    }
    return null;
  }

  /**
   * Get the path where this agent's native MCP configuration should be written
   */
  getNativeMcpPath(projectPath: string): string {
    return resolve(projectPath, this.nativeConfigPath);
  }

  /**
   * Get the global configuration path for this agent
   * Returns null if global configuration is not supported
   */
  getGlobalMcpPath(): string | null {
    return getFullGlobalConfigPath(
      this.definition.globalConfigPath,
      this.definition.globalConfigPaths
    );
  }

  /**
   * Check if this agent supports global configuration
   */
  supportsGlobalConfig(): boolean {
    return this.getGlobalMcpPath() !== null;
  }

  /**
   * Apply MCP configuration to this agent's native config format
   * Must be implemented by each specific agent
   */
  abstract applyMCPConfig(
    projectPath: string, 
    servers: MCPServerConfig[]
  ): Promise<void>;

  /**
   * Get existing MCP servers from this agent's configuration
   * Default implementation returns empty array - should be overridden by agents that support MCP
   */
  async getMCPServers(projectPath: string): Promise<MCPServerConfig[]> {
    return [];
  }

  /**
   * Apply MCP configuration to this agent's global config format
   * Default implementation uses the same logic as applyMCPConfig but with global path
   * Can be overridden by specific agents for different global config formats
   */
  async applyGlobalMCPConfig(servers: MCPServerConfig[]): Promise<void> {
    const globalPath = this.getGlobalMcpPath();
    
    if (!globalPath) {
      throw new Error(`Agent ${this.name} does not support global configuration`);
    }

    // Extract directory from global path and use it as "project path"
    // This allows reusing the existing applyMCPConfig logic
    const lastSlashIndex = Math.max(globalPath.lastIndexOf('/'), globalPath.lastIndexOf('\\'));
    const globalDir = lastSlashIndex > 0 ? globalPath.substring(0, lastSlashIndex) : '';
    
    // Temporarily override the native config path to point to global config
    const originalNativeConfigPath = this.definition.nativeConfigPath;
    const globalFileName = globalPath.substring(lastSlashIndex + 1);
    this.definition.nativeConfigPath = globalFileName;
    
    try {
      await this.applyMCPConfig(globalDir, servers);
    } finally {
      // Restore original native config path
      this.definition.nativeConfigPath = originalNativeConfigPath;
    }
  }

  /**
   * Filter MCP servers based on this agent's capabilities
   * Can be overridden by specific agents for custom filtering logic
   */
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers.filter(server => {
      switch (server.type) {
        case 'stdio':
          return this.capabilities.mcp.stdio;
        case 'http':
          return this.capabilities.mcp.http;
        case 'sse':
          return this.capabilities.mcp.sse;
        default:
          return false;
      }
    });
  }

  /**
   * Transform MCP servers for this agent's requirements
   * Can be overridden by specific agents for custom transformation logic
   */
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    // Default: no transformations
    return servers;
  }

  /**
   * Apply rules configuration to this agent's config file format
   * Must be implemented by each specific agent
   */
  abstract applyRulesConfig(
    configPath: string,
    rules: AppliedRules,
    existingContent: string
  ): Promise<string>;

  /**
   * Extract existing rule texts from config content
   * Must be implemented by each specific agent
   */
  abstract extractExistingRules(content: string): string[];

  /**
   * Extract existing rule sections from config content
   * Must be implemented by each specific agent
   */
  abstract extractExistingSections(content: string): RuleSection[];

  /**
   * Generate rules content in this agent's format
   * Must be implemented by each specific agent
   */
  abstract generateRulesContent(sections: RuleSection[]): string;

  /**
   * Apply rules configuration to this agent
   */
  async applyRules(
    projectPath: string, 
    rules: AppliedRules
  ): Promise<RuleApplicationResult> {
    const applicator = new RulesApplicator();
    return applicator.applyRulesToAgent(this, rules, projectPath, false);
  }

  /**
   * Apply rules configuration to this agent's global config
   */
  async applyGlobalRules(rules: AppliedRules): Promise<RuleApplicationResult> {
    const applicator = new RulesApplicator();
    
    if (!this.supportsGlobalConfig()) {
      return {
        success: false,
        rulesApplied: 0,
        agent: this.name,
        configPath: '',
        errors: [`Agent ${this.name} does not support global configuration`]
      };
    }
    
    // Use empty string as project path for global config
    return applicator.applyRulesToAgent(this, rules, '', true);
  }

  /**
   * Get a summary of this agent
   */
  toString(): string {
    return `${this.name} (${this.id})`;
  }
}