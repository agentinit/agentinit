import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition } from '../types/index.js';

/**
 * Claude Code agent implementation
 * Supports full MCP capabilities including stdio, HTTP, and SSE servers
 * Native config: .mcp.json
 * Global config: ~/.claude.json
 * 
 * Note: Claude Code uses a unique MCP configuration format:
 * - stdio servers: { command, args?, env? }
 * - http servers: { type: "http", url, headers? }
 * - sse servers: { type: "sse", url, headers? }
 */
export class ClaudeAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'claude',
      name: 'Claude Code',
      url: 'https://docs.anthropic.com/claude/docs/claude-code',
      capabilities: {
        mcp: {
          stdio: true,
          http: true,
          sse: true
        },
        rules: true,
        hooks: true,
        commands: true,
        subagents: true,
        statusline: true
      },
      configFiles: ['CLAUDE.md', '.claude/config.md'],
      nativeConfigPath: '.mcp.json',
      globalConfigPath: '~/.claude.json'
    };

    super(definition);
  }

  /**
   * Apply MCP configuration to Claude's native .mcp.json format
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
        console.warn('Warning: Existing .mcp.json is invalid, creating new configuration');
        existingConfig = { mcpServers: {} };
      }
    }

    // Convert our MCP server configs to Claude's format
    for (const server of servers) {
      const claudeServer: any = {};

      switch (server.type) {
        case 'stdio':
          if (server.command) {
            claudeServer.command = server.command;
          }
          if (server.args && server.args.length > 0) {
            claudeServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            claudeServer.env = server.env;
          }
          break;

        case 'http':
          claudeServer.type = 'http';
          if (server.url) {
            claudeServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            claudeServer.headers = server.headers;
          }
          break;

        case 'sse':
          claudeServer.type = 'sse';
          if (server.url) {
            claudeServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            claudeServer.headers = server.headers;
          }
          break;
      }

      // Add or update the server in the config
      existingConfig.mcpServers[server.name] = claudeServer;
    }

    // Write the updated configuration
    const configJson = JSON.stringify(existingConfig, null, 2);
    await writeFile(mcpConfigPath, configJson);
  }

  /**
   * Claude supports all MCP server types, so no filtering needed
   */
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // Claude supports everything
  }

  /**
   * Claude doesn't need any transformations
   */
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // No transformations needed
  }
}