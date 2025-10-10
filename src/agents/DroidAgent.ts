import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, MCPServerType, AgentDefinition } from '../types/index.js';
import type { AppliedRules, RuleSection } from '../types/rules.js';

/**
 * Droid (Factory) agent implementation
 * Supports stdio MCP servers
 * Uses ~/.factory for global configuration
 * MCP config: ~/.factory/mcp.json
 * Rules: AGENTS.md in project root
 */
export class DroidAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'droid',
      name: 'Droid (Factory)',
      url: 'https://factory.ai',
      capabilities: {
        mcp: {
          stdio: true,
          http: false,
          sse: false
        },
        rules: true,
        hooks: false,
        commands: false,
        subagents: false,
        statusline: false
      },
      configFiles: [
        {
          path: 'AGENTS.md',
          purpose: 'rules',
          format: 'markdown',
          type: 'file',
          optional: true,
          description: 'Agent instructions and rules in markdown format'
        }
      ],
      nativeConfigPath: '.factory/mcp.json',
      globalConfigPath: '~/.factory/mcp.json'
    };

    super(definition);
  }

  /**
   * Apply MCP configuration to Droid's ~/.factory/mcp.json format
   * Droid stores configs globally regardless of project-level or global flag
   */
  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    // Delegate to global config application since Droid uses global config
    await this.applyGlobalMCPConfig(servers);
  }

  /**
   * Apply MCP configuration to Droid's global ~/.factory/mcp.json format
   */
  async applyGlobalMCPConfig(servers: MCPServerConfig[]): Promise<void> {
    const globalPath = this.getGlobalMcpPath();

    if (!globalPath) {
      throw new Error(`Droid global configuration path could not be determined`);
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
        console.warn('Warning: Existing ~/.factory/mcp.json is invalid, creating new configuration');
        existingConfig = { mcpServers: {} };
      }
    }

    // Convert our MCP server configs to Droid's format
    for (const server of servers) {
      const droidServer: any = {
        type: 'stdio'
      };

      if (server.command) {
        droidServer.command = server.command;
      }
      if (server.args && server.args.length > 0) {
        droidServer.args = server.args;
      }
      if (server.env && Object.keys(server.env).length > 0) {
        droidServer.env = server.env;
      }

      // Add disabled flag (default false)
      droidServer.disabled = false;

      // Add or update the server in the config
      existingConfig.mcpServers[server.name] = droidServer;
    }

    // Write the updated configuration
    const configJson = JSON.stringify(existingConfig, null, 2);
    await writeFile(globalPath, configJson);
  }

  /**
   * Filter out non-stdio servers since Droid only supports stdio
   */
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers.filter(server => server.type === 'stdio');
  }

  /**
   * Droid doesn't need any transformations for stdio servers
   */
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers;
  }

  /**
   * Apply rules configuration to AGENTS.md
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
   * Extract existing rule texts from AGENTS.md content
   */
  extractExistingRules(content: string): string[] {
    // Extract rules from markdown format - look for lines starting with "- "
    const ruleLines = content.split('\n').filter(line => line.trim().startsWith('- '));
    return ruleLines.map(line => line.replace(/^- /, '').trim()).filter(rule => rule.length > 0);
  }

  /**
   * Extract existing rule sections from AGENTS.md content using ## headers
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
   * Generate rules content in AGENTS.md markdown format
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
   * Get existing MCP servers from Droid's ~/.factory/mcp.json configuration
   * Droid uses global configuration, so we read from the global path
   */
  async getMCPServers(projectPath: string): Promise<MCPServerConfig[]> {
    const globalPath = this.getGlobalMcpPath();

    if (!globalPath) {
      return [];
    }

    const configContent = await readFileIfExists(globalPath);

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
            type: 'stdio' as MCPServerType,
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
