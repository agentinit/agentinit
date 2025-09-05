import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition } from '../types/index.js';

/**
 * Claude Desktop app agent implementation
 * Supports full MCP capabilities including stdio, HTTP, and SSE servers
 * Native config: platform-specific claude_desktop_config.json
 */
export class ClaudeDesktopAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      url: 'https://claude.ai/download',
      capabilities: {
        mcp: {
          stdio: true,
          http: true,
          sse: true
        },
        rules: false,    // No .rules files support
        hooks: false,    // No hook system
        commands: false, // No custom commands
        subagents: false,// No subagent support
        statusline: false// No statusline customization
      },
      configFiles: [], // Claude Desktop doesn't have project-specific detection files
      nativeConfigPath: 'claude_desktop_config.json', // Not used for project-level
      globalConfigPaths: {
        windows: '%APPDATA%/Claude/claude_desktop_config.json',
        darwin: '~/Library/Application Support/Claude/claude_desktop_config.json',
        linux: '~/.config/Claude/claude_desktop_config.json'
      }
    };

    super(definition);
  }

  /**
   * Claude Desktop doesn't support project-level detection since it's a desktop app
   */
  async detectPresence(): Promise<null> {
    return null;
  }

  /**
   * Claude Desktop is not used for project-level configurations
   * This method should not be called
   */
  async applyMCPConfig(): Promise<void> {
    throw new Error('Claude Desktop only supports global configuration. Use --global flag.');
  }

  /**
   * Apply MCP configuration to Claude Desktop's global config format
   */
  async applyGlobalMCPConfig(servers: MCPServerConfig[]): Promise<void> {
    const globalPath = this.getGlobalMcpPath();
    
    if (!globalPath) {
      throw new Error(`Claude Desktop global configuration path could not be determined for this platform`);
    }

    // Ensure the directory exists
    await ensureDirectoryExists(globalPath);

    // Read existing configuration
    const existingContent = await readFileIfExists(globalPath);
    let existingConfig: any = { mcpServers: {} };

    if (existingContent) {
      try {
        existingConfig = JSON.parse(existingContent);
        if (!existingConfig.mcpServers) {
          existingConfig.mcpServers = {};
        }
      } catch (error) {
        console.warn('Warning: Existing claude_desktop_config.json is invalid, creating new configuration');
        existingConfig = { mcpServers: {} };
      }
    }

    // Convert our MCP server configs to Claude Desktop's format
    for (const server of servers) {
      const claudeDesktopServer: any = {};

      switch (server.type) {
        case 'stdio':
          if (server.command) {
            claudeDesktopServer.command = server.command;
          }
          if (server.args && server.args.length > 0) {
            claudeDesktopServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            claudeDesktopServer.env = server.env;
          }
          break;

        case 'http':
        case 'sse':
          if (server.url) {
            claudeDesktopServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            claudeDesktopServer.headers = server.headers;
          }
          break;
      }

      // Add or update the server in the config
      existingConfig.mcpServers[server.name] = claudeDesktopServer;
    }

    // Write the updated configuration
    const configJson = JSON.stringify(existingConfig, null, 2);
    await writeFile(globalPath, configJson);
  }

  /**
   * Claude Desktop supports all MCP server types, so no filtering needed
   */
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // Claude Desktop supports everything
  }

  /**
   * Claude Desktop doesn't need any transformations
   */
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // No transformations needed
  }
}