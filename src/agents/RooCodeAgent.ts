import { MarkdownRulesAgent } from './MarkdownRulesAgent.js';
import { ensureDirectoryExists, readFileIfExists, writeFile } from '../utils/fs.js';
import type { AgentDefinition, MCPServerConfig, MCPServerType } from '../types/index.js';

export class RooCodeAgent extends MarkdownRulesAgent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'roo',
      name: 'RooCode',
      capabilities: {
        mcp: {
          stdio: true,
          http: true,
          sse: true,
        },
        rules: true,
        hooks: false,
        commands: false,
        subagents: false,
        statusline: false,
        skills: true,
      },
      configFiles: [
        {
          path: 'AGENTS.md',
          purpose: 'rules',
          format: 'markdown',
          type: 'file',
          optional: true,
          description: 'RooCode instructions file',
        },
        {
          path: '.roo/mcp.json',
          purpose: 'mcp',
          format: 'json',
          type: 'file',
          optional: true,
          description: 'RooCode MCP configuration',
        },
      ],
      nativeConfigPath: '.roo/mcp.json',
      rulesPath: 'AGENTS.md',
      skillPaths: {
        project: '.agents/skills/',
        global: '~/.roo/skills/',
      },
      projectStandards: {
        rules: 'agents',
        skills: 'agents',
      },
    };

    super(definition);
  }

  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    const configPath = this.getNativeMcpPath(projectPath);
    await ensureDirectoryExists(configPath);

    const existingContent = await readFileIfExists(configPath);
    let existingConfig: any = { mcpServers: {} };

    if (existingContent) {
      try {
        existingConfig = JSON.parse(existingContent);
        if (!existingConfig.mcpServers) {
          existingConfig.mcpServers = {};
        }
      } catch {
        existingConfig = { mcpServers: {} };
      }
    }

    for (const server of servers) {
      const nextServer: any = {};

      if (server.command) nextServer.command = server.command;
      if (server.args?.length) nextServer.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) nextServer.env = server.env;
      if (server.url) nextServer.url = server.url;
      if (server.headers && Object.keys(server.headers).length > 0) nextServer.headers = server.headers;

      existingConfig.mcpServers[server.name] = nextServer;
    }

    await writeFile(configPath, JSON.stringify(existingConfig, null, 2));
  }

  async removeMCPServer(projectPath: string, serverName: string): Promise<boolean> {
    const configPath = this.getNativeMcpPath(projectPath);
    const content = await readFileIfExists(configPath);
    if (!content) return false;

    try {
      const config = JSON.parse(content);
      if (!config.mcpServers || !(serverName in config.mcpServers)) return false;
      delete config.mcpServers[serverName];
      await writeFile(configPath, JSON.stringify(config, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  async getMCPServers(projectPath: string): Promise<MCPServerConfig[]> {
    const configPath = this.getNativeMcpPath(projectPath);
    const content = await readFileIfExists(configPath);
    if (!content) return [];

    try {
      const config = JSON.parse(content);
      const servers: MCPServerConfig[] = [];

      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers) as [string, any][]) {
          const server: MCPServerConfig = {
            name,
            type: (serverConfig.command ? 'stdio' : 'http') as MCPServerType,
          };

          if (serverConfig.command) server.command = serverConfig.command;
          if (serverConfig.args) server.args = serverConfig.args;
          if (serverConfig.env) server.env = serverConfig.env;
          if (serverConfig.url) server.url = serverConfig.url;
          if (serverConfig.headers) server.headers = serverConfig.headers;

          servers.push(server);
        }
      }

      return servers;
    } catch {
      return [];
    }
  }
}
