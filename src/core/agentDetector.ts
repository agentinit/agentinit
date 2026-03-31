import { isAbsolute, resolve } from 'path';
import { fileExists } from '../utils/fs.js';
import { expandTilde } from '../utils/paths.js';
import type { AgentConfig, AgentDetectionScope } from '../types/index.js';

interface AgentDetectorOptions {
  includeEnvironment?: boolean;
}

export class AgentDetector {
  private readonly agentConfigs: Array<{
    name: string;
    files: string[];
    scope?: AgentDetectionScope;
  }> = [
    { name: 'cursor', files: ['.cursorrules', '.cursor/settings.json'] },
    { name: 'claude', files: ['CLAUDE.md', '.claude/config.md'] },
    { name: 'windsurf', files: ['.windsurfrules', '.windsurf'] },
    // AGENTS.md is a cross-agent standard, so it is not a reliable detection signal
    { name: 'copilot', files: ['.vscode/mcp.json', '.github/copilot.yml'] },
    { name: 'codeium', files: ['.codeium/config.json'] },
    { name: 'codex', files: ['.codex/config.toml'] },
    { name: 'gemini', files: ['.gemini/settings.json'] },
    { name: 'openclaw', files: ['~/.openclaw'], scope: 'environment' },
    { name: 'hermes', files: ['~/.hermes'], scope: 'environment' },
    // .mcp.json is also used by other agents, so only use aider-specific config here
    { name: 'aider', files: ['.aider.conf.yml'] },
    { name: 'cline', files: ['.clinerules'] },
    { name: 'roo', files: ['.roo/mcp.json'] },
    { name: 'zed', files: ['.zed/settings.json'] }
  ];

  async detectAgents(
    projectPath: string,
    options: AgentDetectorOptions = {},
  ): Promise<AgentConfig[]> {
    const results: AgentConfig[] = [];

    for (const config of this.agentConfigs) {
      if (!this.shouldCheckScope(config.scope, options)) {
        continue;
      }

      const detected = await this.checkAgentFiles(projectPath, config.files);
      
      results.push({
        name: config.name,
        files: config.files,
        detected: detected.found,
        ...(detected.path && { configPath: detected.path })
      });
    }

    return results;
  }

  private shouldCheckScope(
    scope: AgentDetectionScope | undefined,
    options: AgentDetectorOptions,
  ): boolean {
    if (options.includeEnvironment) {
      return true;
    }

    return scope !== 'environment';
  }

  private async checkAgentFiles(
    projectPath: string, 
    files: string[]
  ): Promise<{ found: boolean; path?: string }> {
    for (const file of files) {
      const fullPath = this.resolveDetectionPath(projectPath, file);
      if (await fileExists(fullPath)) {
        return { found: true, path: fullPath };
      }
    }
    return { found: false };
  }

  private resolveDetectionPath(projectPath: string, file: string): string {
    if (file.startsWith('~')) {
      return expandTilde(file);
    }

    if (isAbsolute(file)) {
      return file;
    }

    return resolve(projectPath, file);
  }

  async detectAgentByName(
    projectPath: string,
    agentName: string,
    options: AgentDetectorOptions = {},
  ): Promise<AgentConfig | null> {
    const config = this.agentConfigs.find(c => c.name === agentName);
    if (!config) return null;

    if (!this.shouldCheckScope(config.scope, options)) {
      return {
        name: config.name,
        files: config.files,
        detected: false,
      };
    }

    const detected = await this.checkAgentFiles(projectPath, config.files);
    
    return {
      name: config.name,
      files: config.files,
      detected: detected.found,
      ...(detected.path && { configPath: detected.path })
    };
  }

  getSupportedAgents(): string[] {
    return this.agentConfigs.map(c => c.name);
  }
}
