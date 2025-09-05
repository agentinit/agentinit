import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition } from '../types/index.js';

/**
 * Cursor IDE agent implementation
 * Supports full MCP capabilities including stdio, HTTP, and SSE servers
 * Native config: .cursor/mcp.json
 */
export class CursorAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'cursor',
      name: 'Cursor IDE',
      url: 'https://docs.cursor.com/context/model-context-protocol',
      capabilities: {
        mcp: {
          stdio: true,
          http: true,
          sse: true
        },
        rules: true,
        hooks: false,
        commands: false,
        subagents: false,
        statusline: false
      },
      configFiles: ['.cursorrules', '.cursor/settings.json', '.cursor/mcp.json'],
      nativeConfigPath: '.cursor/mcp.json',
      globalConfigPath: '~/.cursor/mcp.json'
    };

    super(definition);
  }

  /**
   * Apply MCP configuration to Cursor's native .cursor/mcp.json format
   */
  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    const mcpConfigPath = this.getNativeMcpPath(projectPath);
    
    // Ensure the directory exists
    await ensureDirectoryExists(mcpConfigPath);

    // Read existing configuration
    const existingContent = await readFileIfExists(mcpConfigPath);
    let existingConfig: any = { mcpServers: {} };

    if (existingContent) {
      try {
        existingConfig = JSON.parse(existingContent);
        if (!existingConfig.mcpServers) {
          existingConfig.mcpServers = {};
        }
      } catch (error) {
        console.warn('Warning: Existing .cursor/mcp.json is invalid, creating new configuration');
        existingConfig = { mcpServers: {} };
      }
    }

    // Convert our MCP server configs to Cursor's format
    for (const server of servers) {
      const cursorServer: any = {};

      switch (server.type) {
        case 'stdio':
          if (server.command) {
            cursorServer.command = server.command;
          }
          if (server.args && server.args.length > 0) {
            cursorServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            cursorServer.env = server.env;
          }
          break;

        case 'http':
        case 'sse':
          if (server.url) {
            cursorServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            cursorServer.headers = server.headers;
          }
          break;
      }

      // Add or update the server in the config
      existingConfig.mcpServers[server.name] = cursorServer;
    }

    // Write the updated configuration
    const configJson = JSON.stringify(existingConfig, null, 2);
    await writeFile(mcpConfigPath, configJson);
  }

  /**
   * Cursor supports all MCP server types, so no filtering needed
   */
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // Cursor supports everything
  }

  /**
   * Cursor doesn't need any transformations
   */
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // No transformations needed
  }
}