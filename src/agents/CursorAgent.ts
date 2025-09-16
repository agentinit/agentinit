import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition, createConfigFile } from '../types/index.js';
import type { AppliedRules, RuleSection } from '../types/rules.js';

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
      configFiles: [
        {
          path: '.cursor/rules',
          purpose: 'rules',
          format: 'markdown',
          type: 'folder',
          optional: true,
          description: 'AI behavior rules directory with MDC files'
        },
        {
          path: 'AGENTS.md',
          purpose: 'rules',
          format: 'markdown',
          type: 'file',
          optional: true,
          description: 'Simple agent instructions in markdown format'
        },
        {
          path: '.cursor/settings.json',
          purpose: 'settings',
          format: 'json',
          type: 'file',
          optional: true,
          description: 'Cursor IDE preferences and settings'
        },
        {
          path: '.cursor/mcp.json',
          purpose: 'mcp',
          format: 'json',
          type: 'file',
          optional: true,
          description: 'Model Context Protocol server configurations'
        }
      ],
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

  /**
   * Apply rules configuration to Cursor's .cursorrules format
   */
  async applyRulesConfig(
    configPath: string,
    rules: AppliedRules,
    existingContent: string
  ): Promise<string> {
    // Extract all existing rule texts (ignore section headers)
    const existingRules = this.extractAllRuleTexts(existingContent);
    
    // Filter new sections to only include rules that don't already exist
    const filteredSections = rules.sections.map(section => ({
      ...section,
      rules: section.rules.filter(rule => !existingRules.includes(rule))
    })).filter(section => section.rules.length > 0); // Remove empty sections
    
    if (filteredSections.length === 0) {
      // No new rules to add
      return existingContent;
    }
    
    // Append new sections to existing content
    let content = existingContent;
    if (content && !content.endsWith('\n')) {
      content += '\n';
    }
    if (content) {
      content += '\n';
    }
    
    // Add only the new sections with unique rules
    const sectionsContent = this.generateRulesContent(filteredSections);
    content += sectionsContent;
    
    return content.trim() + '\n';
  }

  /**
   * Extract existing rule texts from .cursorrules content (ignoring headers and comments)
   */
  extractExistingRules(content: string): string[] {
    return this.extractAllRuleTexts(content);
  }

  /**
   * Extract existing rule sections from .cursorrules content using # headers
   */
  extractExistingSections(content: string): RuleSection[] {
    const lines = content.split('\n');
    const sections: RuleSection[] = [];
    let currentSection: RuleSection | null = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check if it's a section header
      if (trimmed.startsWith('#') && trimmed.includes(' ')) {
        // Start new section
        if (currentSection) {
          sections.push(currentSection);
        }
        const sectionName = trimmed.replace(/^#\s*/, '');
        currentSection = {
          templateId: sectionName.toLowerCase().replace(/\s+/g, '_'),
          templateName: sectionName,
          rules: []
        };
      } else if (currentSection && trimmed && !trimmed.startsWith('#')) {
        // Add rule to current section
        currentSection.rules.push(trimmed);
      }
    }
    
    // Add the last section
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections;
  }

  /**
   * Generate rules content in Cursor's .cursorrules format
   */
  generateRulesContent(sections: RuleSection[]): string {
    let content = '';
    
    if (sections && sections.length > 0) {
      // Group rules by sections
      for (const ruleSection of sections) {
        content += `# ${ruleSection.templateName}\n`;
        for (const rule of ruleSection.rules) {
          content += `${rule}\n`;
        }
        content += '\n';
      }
    }
    
    return content;
  }

  /**
   * Extract all rule texts from file content (ignoring headers and comments)
   */
  private extractAllRuleTexts(content: string): string[] {
    const rules: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines, headers (starting with #), and other comments
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
        rules.push(trimmed);
      }
    }
    
    return rules;
  }
}