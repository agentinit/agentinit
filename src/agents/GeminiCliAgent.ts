import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition } from '../types/index.js';

/**
 * Google Gemini CLI agent implementation
 * Supports stdio, HTTP, and SSE MCP servers
 * Native config: .gemini/settings.json (general settings file, not just MCP)
 */
export class GeminiCliAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'gemini',
      name: 'Google Gemini CLI',
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
      configFiles: ['.gemini/settings.json'],
      nativeConfigPath: '.gemini/settings.json',
      globalConfigPath: '~/.gemini/settings.json'
    };

    super(definition);
  }

  /**
   * Apply MCP configuration to Gemini CLI's native JSON settings format
   */
  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    const settingsPath = this.getNativeMcpPath(projectPath);
    
    // Ensure the directory exists
    await ensureDirectoryExists(settingsPath);

    // Read existing configuration
    const existingContent = await readFileIfExists(settingsPath);
    let existingConfig: any = { mcpServers: {} };

    if (existingContent) {
      try {
        existingConfig = JSON.parse(existingContent);
        if (!existingConfig.mcpServers) {
          existingConfig.mcpServers = {};
        }
      } catch (error) {
        console.warn('Warning: Existing .gemini/settings.json is invalid, creating new configuration');
        existingConfig = { mcpServers: {} };
      }
    }

    // Convert our MCP server configs to Gemini's format
    for (const server of servers) {
      const geminiServer: any = {};

      switch (server.type) {
        case 'stdio':
          if (server.command) {
            geminiServer.command = server.command;
          }
          if (server.args && server.args.length > 0) {
            geminiServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            geminiServer.env = server.env;
          }
          break;

        case 'http':
        case 'sse':
          if (server.url) {
            geminiServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            geminiServer.headers = server.headers;
          }
          break;
      }

      // Add or update the server in the config
      existingConfig.mcpServers[server.name] = geminiServer;
    }

    // Write the updated configuration
    const configJson = JSON.stringify(existingConfig, null, 2);
    await writeFile(settingsPath, configJson);
  }

  /**
   * Gemini supports all MCP server types, so no filtering needed
   */
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // Gemini supports all MCP types
  }

  /**
   * Gemini doesn't need any transformations
   */
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // No transformations needed
  }
}