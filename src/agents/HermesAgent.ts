import { Agent } from './Agent.js';
import { fileExists } from '../utils/fs.js';
import { expandTilde } from '../utils/paths.js';
import type { AgentDefinition, AgentDetectionResult, MCPServerConfig } from '../types/index.js';
import type { AppliedRules, RuleSection } from '../types/rules.js';

export class HermesAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'hermes',
      name: 'Hermes',
      capabilities: {
        mcp: {
          stdio: false,
          http: false,
          sse: false,
        },
        rules: false,
        hooks: false,
        commands: false,
        subagents: false,
        statusline: false,
        skills: true,
      },
      configFiles: [],
      nativeConfigPath: '.hermes/config.json',
      detectionScope: 'environment',
      skillPaths: {
        project: '.agents/skills/',
        global: '~/.hermes/skills/',
      },
      projectStandards: {
        skills: 'agents',
      },
    };

    super(definition);
  }

  async detectPresence(_projectPath: string): Promise<AgentDetectionResult | null> {
    const hermesHome = expandTilde('~/.hermes');
    if (!(await fileExists(hermesHome))) {
      return null;
    }

    return {
      agent: this,
      configPath: hermesHome,
    };
  }

  async applyMCPConfig(_projectPath: string, _servers: MCPServerConfig[]): Promise<void> {
    throw new Error('Hermes does not support MCP configuration.');
  }

  async removeMCPServer(_projectPath: string, _serverName: string): Promise<boolean> {
    throw new Error('Hermes does not support MCP configuration.');
  }

  async applyRulesConfig(
    _configPath: string,
    _rules: AppliedRules,
    _existingContent: string,
  ): Promise<string> {
    throw new Error('Hermes does not support rules configuration.');
  }

  extractExistingRules(_content: string): string[] {
    return [];
  }

  extractExistingSections(_content: string): RuleSection[] {
    return [];
  }

  generateRulesContent(_sections: RuleSection[]): string {
    return '';
  }
}
