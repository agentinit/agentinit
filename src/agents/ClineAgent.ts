import { Agent } from './Agent.js';
import { MarkdownRulesAgent } from './MarkdownRulesAgent.js';
import type { MCPServerConfig, AgentDefinition } from '../types/index.js';

export class ClineAgent extends MarkdownRulesAgent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'cline',
      name: 'Cline',
      capabilities: {
        mcp: {
          stdio: false,
          http: false,
          sse: false,
        },
        rules: true,
        hooks: false,
        commands: false,
        subagents: false,
        statusline: false,
        skills: false,
      },
      configFiles: [
        {
          path: '.clinerules',
          purpose: 'rules',
          format: 'text',
          type: 'file',
          optional: true,
          description: 'Cline rules file',
        },
      ],
      nativeConfigPath: '.clinerules',
      rulesPath: '.clinerules',
    };

    super(definition);
  }

  async applyMCPConfig(_projectPath: string, _servers: MCPServerConfig[]): Promise<void> {
    throw new Error('Cline does not support MCP configuration');
  }

  async removeMCPServer(_projectPath: string, _serverName: string): Promise<boolean> {
    return false;
  }
}
