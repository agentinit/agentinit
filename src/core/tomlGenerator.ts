import * as TOML from '@iarna/toml';
import { MCPServerConfig, MCPServerType, TomlMCPServer } from '../types/index.js';

export class TOMLGenerator {
  /**
   * Generate TOML configuration from MCP server configurations
   */
  static generateTOML(servers: MCPServerConfig[]): string {
    const config: any = {
      mcp_servers: {}
    };

    for (const server of servers) {
      const tomlServer: any = {};

      switch (server.type) {
        case MCPServerType.STDIO:
          if (server.command) {
            tomlServer.command = server.command;
          }
          if (server.args && server.args.length > 0) {
            tomlServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            tomlServer.env = server.env;
          }
          break;

        case MCPServerType.HTTP:
        case MCPServerType.SSE:
          if (server.url) {
            tomlServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            tomlServer.headers = server.headers;
          }
          break;
      }

      config.mcp_servers[server.name] = tomlServer;
    }

    return this.formatTOML(TOML.stringify(config));
  }

  /**
   * Format TOML output for better readability
   */
  private static formatTOML(tomlString: string): string {
    const lines = tomlString.split('\n');
    const formattedLines: string[] = [];
    
    // Add header comment
    formattedLines.push('# AgentInit MCP Configuration');
    formattedLines.push('# Generated automatically by agentinit');
    formattedLines.push('');
    formattedLines.push('# --- MCP Server Definitions ---');

    let inServerBlock = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('[mcp_servers.')) {
        if (inServerBlock) {
          formattedLines.push(''); // Add blank line between servers
        }
        inServerBlock = true;
        // Remove indentation from table headers
        formattedLines.push(trimmedLine);
      } else if (trimmedLine) {
        // Preserve original formatting for non-table lines
        formattedLines.push(line);
      }
    }

    return formattedLines.join('\n') + '\n';
  }

  /**
   * Merge new servers with existing TOML configuration
   */
  static mergeTOML(existingToml: string, newServers: MCPServerConfig[]): string {
    let existingConfig: any = {};

    if (existingToml.trim()) {
      try {
        existingConfig = TOML.parse(existingToml);
      } catch (error) {
        // If existing TOML is invalid, start fresh
        console.warn('Warning: Existing TOML configuration is invalid, creating new configuration');
      }
    }

    // Ensure mcp_servers section exists
    if (!existingConfig.mcp_servers) {
      existingConfig.mcp_servers = {};
    }

    // Add new servers
    for (const server of newServers) {
      const tomlServer: any = {};

      switch (server.type) {
        case MCPServerType.STDIO:
          if (server.command) {
            tomlServer.command = server.command;
          }
          if (server.args && server.args.length > 0) {
            tomlServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            tomlServer.env = server.env;
          }
          break;

        case MCPServerType.HTTP:
        case MCPServerType.SSE:
          if (server.url) {
            tomlServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            tomlServer.headers = server.headers;
          }
          break;
      }

      existingConfig.mcp_servers[server.name] = tomlServer;
    }

    return this.formatTOML(TOML.stringify(existingConfig));
  }
}