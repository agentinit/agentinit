import { Agent } from '../agents/Agent.js';
import type { 
  MCPServerConfig, 
  FilteredMCPConfig, 
  MCPTransformation 
} from '../types/index.js';

/**
 * MCP filtering and transformation utility
 * Handles capability-based filtering and agent-specific transformations
 */
export class MCPFilter {
  /**
   * Filter and transform MCP servers for a specific agent
   */
  static filterForAgent(agent: Agent, servers: MCPServerConfig[]): FilteredMCPConfig {
    const transformations: MCPTransformation[] = [];

    // First, let the agent transform servers (e.g., remote to stdio)
    const transformedServers = agent.transformMCPServers(servers);

    // Track transformations
    for (let i = 0; i < servers.length; i++) {
      const original = servers[i];
      const transformed = transformedServers[i];

      if (original && transformed && this.hasServerChanged(original, transformed)) {
        transformations.push({
          original,
          transformed,
          reason: this.getTransformationReason(agent, original, transformed)
        });
      }
    }

    // Then filter based on capabilities
    const filteredServers = agent.filterMCPServers(transformedServers);

    return {
      servers: filteredServers,
      transformations
    };
  }

  /**
   * Filter MCP servers based on generic capabilities
   */
  static filterByCapabilities(
    servers: MCPServerConfig[], 
    capabilities: { stdio: boolean; http: boolean; sse: boolean }
  ): MCPServerConfig[] {
    return servers.filter(server => {
      switch (server.type) {
        case 'stdio':
          return capabilities.stdio;
        case 'http':
          return capabilities.http;
        case 'sse':
          return capabilities.sse;
        default:
          return false;
      }
    });
  }

  /**
   * Get servers that would be filtered out by an agent
   */
  static getFilteredOutServers(agent: Agent, servers: MCPServerConfig[]): MCPServerConfig[] {
    const filtered = this.filterForAgent(agent, servers);
    const filteredServerNames = new Set(filtered.servers.map(s => s.name));
    
    return servers.filter(server => !filteredServerNames.has(server.name));
  }

  /**
   * Check if a server has been modified during transformation
   */
  private static hasServerChanged(original: MCPServerConfig, transformed: MCPServerConfig): boolean {
    return (
      original.type !== transformed.type ||
      original.command !== transformed.command ||
      original.url !== transformed.url ||
      JSON.stringify(original.args) !== JSON.stringify(transformed.args) ||
      JSON.stringify(original.env) !== JSON.stringify(transformed.env) ||
      JSON.stringify(original.headers) !== JSON.stringify(transformed.headers)
    );
  }

  /**
   * Generate a human-readable reason for the transformation
   */
  private static getTransformationReason(
    agent: Agent, 
    original: MCPServerConfig, 
    transformed: MCPServerConfig
  ): string {
    if (original.type !== transformed.type) {
      if (original.type === 'http' && transformed.type === 'stdio') {
        return `${agent.name} only supports stdio MCPs - converted HTTP server to use mcp-remote proxy`;
      }
      if (original.type === 'sse' && transformed.type === 'stdio') {
        return `${agent.name} only supports stdio MCPs - converted SSE server to use mcp-remote proxy`;
      }
    }

    if (original.command !== transformed.command) {
      return `Command modified for ${agent.name} compatibility`;
    }

    if (JSON.stringify(original.args) !== JSON.stringify(transformed.args)) {
      return `Arguments modified for ${agent.name} compatibility`;
    }

    if (JSON.stringify(original.env) !== JSON.stringify(transformed.env)) {
      return `Environment variables modified for ${agent.name} compatibility`;
    }

    return `Server configuration modified for ${agent.name} compatibility`;
  }

  /**
   * Validate that servers are compatible with agent capabilities
   */
  static validateCompatibility(agent: Agent, servers: MCPServerConfig[]): {
    compatible: MCPServerConfig[];
    incompatible: MCPServerConfig[];
  } {
    const compatible: MCPServerConfig[] = [];
    const incompatible: MCPServerConfig[] = [];

    for (const server of servers) {
      const supportsType = agent.capabilities.mcp[server.type];
      if (supportsType) {
        compatible.push(server);
      } else {
        incompatible.push(server);
      }
    }

    return { compatible, incompatible };
  }

  /**
   * Get a summary of filtering and transformation results
   */
  static getSummary(agent: Agent, servers: MCPServerConfig[]): string {
    const filtered = this.filterForAgent(agent, servers);
    const summary: string[] = [];

    summary.push(`${agent.name} processed ${servers.length} MCP server(s):`);
    summary.push(`• ${filtered.servers.length} servers will be applied`);
    
    if (filtered.transformations.length > 0) {
      summary.push(`• ${filtered.transformations.length} servers were transformed for compatibility`);
    }

    const filteredOut = servers.length - filtered.servers.length;
    if (filteredOut > 0) {
      summary.push(`• ${filteredOut} servers were filtered out (unsupported)`);
    }

    return summary.join('\n');
  }
}