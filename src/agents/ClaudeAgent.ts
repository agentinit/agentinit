import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, MCPServerType, AgentDefinition } from '../types/index.js';
import type { AppliedRules, RuleSection } from '../types/rules.js';

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
      configFiles: [
        {
          path: 'CLAUDE.md',
          purpose: 'rules',
          format: 'markdown',
          type: 'file',
          optional: true,
          description: 'Claude-specific configuration and rules'
        },
        {
          path: '.claude/config.md',
          purpose: 'rules',
          format: 'markdown',
          type: 'file',
          optional: true,
          description: 'Alternative Claude configuration file'
        }
      ],
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

  /**
   * Apply rules configuration to Claude's CLAUDE.md format
   */
  async applyRulesConfig(
    configPath: string,
    rules: AppliedRules,
    existingContent: string
  ): Promise<string> {
    const rulesSection = this.generateRulesContent(rules.sections);
    
    let content = existingContent;
    
    // For markdown, we'll append rules directly
    if (content && !content.endsWith('\n')) {
      content += '\n';
    }
    if (content) {
      content += '\n';
    }
    content += rulesSection;
    
    return content.trim() + '\n';
  }

  /**
   * Extract existing rule texts from CLAUDE.md content
   */
  extractExistingRules(content: string): string[] {
    // Extract rules from markdown format - look for lines starting with "- "
    const ruleLines = content.split('\n').filter(line => line.trim().startsWith('- '));
    return ruleLines.map(line => line.replace(/^- /, '').trim()).filter(rule => rule.length > 0);
  }

  /**
   * Extract existing rule sections from CLAUDE.md content using ## headers
   */
  extractExistingSections(content: string): RuleSection[] {
    const lines = content.split('\n');
    const sections: RuleSection[] = [];
    let currentSection: RuleSection | null = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check if it's a section header
      if (trimmed.startsWith('## ') && trimmed.includes(' ')) {
        // Start new section
        if (currentSection) {
          sections.push(currentSection);
        }
        const sectionName = trimmed.replace(/^##\s*/, '');
        currentSection = {
          templateId: sectionName.toLowerCase().replace(/\s+/g, '_'),
          templateName: sectionName,
          rules: []
        };
      } else if (currentSection && trimmed.startsWith('- ')) {
        // Add rule to current section
        const rule = trimmed.replace(/^- /, '');
        currentSection.rules.push(rule);
      }
    }
    
    // Add the last section
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections;
  }

  /**
   * Generate rules content in Claude's CLAUDE.md markdown format
   */
  generateRulesContent(sections: RuleSection[]): string {
    let content = '';
    
    if (sections && sections.length > 0) {
      // Group rules by sections
      for (const ruleSection of sections) {
        content += `## ${ruleSection.templateName}\n\n`;
        for (const rule of ruleSection.rules) {
          content += `- ${rule}\n`;
        }
        content += '\n';
      }
    }
    
    return content;
  }

  /**
   * Get existing MCP servers from Claude's .mcp.json configuration
   */
  async getMCPServers(projectPath: string): Promise<MCPServerConfig[]> {
    const mcpConfigPath = this.getNativeMcpPath(projectPath);
    const configContent = await readFileIfExists(mcpConfigPath);
    
    if (!configContent) {
      return [];
    }

    try {
      const config = JSON.parse(configContent);
      const servers: MCPServerConfig[] = [];

      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers) as [string, any][]) {
          const server: MCPServerConfig = {
            name,
            type: serverConfig.type as MCPServerType,
          };

          if (serverConfig.command) {
            server.command = serverConfig.command;
          }
          if (serverConfig.args) {
            server.args = serverConfig.args;
          }
          if (serverConfig.env) {
            server.env = serverConfig.env;
          }
          if (serverConfig.url) {
            server.url = serverConfig.url;
          }
          if (serverConfig.headers) {
            server.headers = serverConfig.headers;
          }

          servers.push(server);
        }
      }

      return servers;
    } catch (error) {
      // Invalid JSON or missing mcpServers property
      return [];
    }
  }
}