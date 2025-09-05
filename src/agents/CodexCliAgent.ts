import { resolve } from 'path';
import * as TOML from '@iarna/toml';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition, MCPServerType } from '../types/index.js';

/**
 * OpenAI Codex CLI agent implementation
 * Supports only stdio MCP servers - transforms remote servers to stdio via mcp-remote proxy
 * Native config: .codex/config.toml
 */
export class CodexCliAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'codex',
      name: 'OpenAI Codex CLI',
      capabilities: {
        mcp: {
          stdio: true,
          http: false, // Supported via transformation
          sse: false   // Supported via transformation
        },
        rules: true,
        hooks: false,
        commands: false,
        subagents: false,
        statusline: false
      },
      configFiles: ['.codex/config.toml'],
      nativeConfigPath: '.codex/config.toml',
      globalConfigPath: '~/.codex/config.toml'
    };

    super(definition);
  }

  /**
   * Apply MCP configuration to Codex CLI's native TOML format
   */
  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    const tomlConfigPath = this.getNativeMcpPath(projectPath);
    
    // Ensure the directory exists
    await ensureDirectoryExists(tomlConfigPath);

    // Read existing configuration
    const existingContent = await readFileIfExists(tomlConfigPath);
    let existingConfig: any = { mcp_servers: {} };

    if (existingContent) {
      try {
        existingConfig = TOML.parse(existingContent);
        if (!existingConfig.mcp_servers) {
          existingConfig.mcp_servers = {};
        }
      } catch (error) {
        console.warn('Warning: Existing .codex/config.toml is invalid, creating new configuration');
        existingConfig = { mcp_servers: {} };
      }
    }

    // Transform servers to stdio format and add to config
    const transformedServers = this.transformMCPServers(servers);
    
    for (const server of transformedServers) {
      const codexServer: any = {};

      // All servers should be stdio at this point after transformation
      if (server.command) {
        codexServer.command = server.command;
      }
      if (server.args && server.args.length > 0) {
        codexServer.args = server.args;
      }
      if (server.env && Object.keys(server.env).length > 0) {
        codexServer.env = server.env;
      }

      existingConfig.mcp_servers[server.name] = codexServer;
    }

    // Write the updated configuration using TOML formatting
    const formattedToml = this.formatTOML(TOML.stringify(existingConfig));
    await writeFile(tomlConfigPath, formattedToml);
  }

  /**
   * Codex only supports stdio, so filter out others (they'll be transformed)
   */
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    // Don't filter here - let transformMCPServers handle the conversion
    return servers;
  }

  /**
   * Transform remote (HTTP/SSE) servers to stdio using mcp-remote proxy
   */
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers.map(server => {
      // Keep stdio servers as-is
      if (server.type === 'stdio') {
        return server;
      }

      // Transform remote servers to use mcp-remote proxy
      const transformedServer: MCPServerConfig = {
        name: server.name,
        type: 'stdio' as MCPServerType,
        command: 'npx',
        args: ['-y', 'mcp-remote@latest'],
        env: server.env || {}
      };

      // Add the URL as an argument to mcp-remote
      if (server.url) {
        transformedServer.args!.push(server.url);
      }

      // Add any headers as environment variables
      if (server.headers) {
        for (const [key, value] of Object.entries(server.headers)) {
          transformedServer.env![`MCP_HEADER_${key.toUpperCase().replace(/-/g, '_')}`] = value;
        }
      }

      return transformedServer;
    });
  }

  /**
   * Format TOML output for Codex CLI with proper structure and comments
   */
  private formatTOML(tomlString: string): string {
    const lines = tomlString.split('\n');
    const formattedLines: string[] = [];
    
    // Add header comment
    formattedLines.push('# Codex CLI MCP Configuration');
    formattedLines.push('# Generated automatically by agentinit');
    formattedLines.push('# Remote MCPs are automatically converted to stdio via mcp-remote proxy');
    formattedLines.push('');

    let inServerBlock = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('[mcp_servers.')) {
        if (inServerBlock) {
          formattedLines.push(''); // Add blank line between servers
        }
        inServerBlock = true;
        formattedLines.push(trimmedLine);
      } else if (trimmedLine) {
        formattedLines.push(trimmedLine);
      }
    }

    return formattedLines.join('\n') + '\n';
  }
}