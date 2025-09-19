import { resolve } from 'path';
import { fileExists } from '../utils/fs.js';
import type { AgentConfig } from '../types/index.js';

export class AgentDetector {
  private readonly agentConfigs: Array<{
    name: string;
    files: string[];
  }> = [
    { name: 'cursor', files: ['.cursorrules', '.cursor/settings.json'] },
    { name: 'claude', files: ['CLAUDE.md', '.claude/config.md'] },
    { name: 'windsurf', files: ['.windsurfrules', '.windsurf'] },
    { name: 'copilot', files: ['.github/copilot.yml'] },
    { name: 'codeium', files: ['.codeium/config.json'] },
    { name: 'codex', files: ['.codex/config.toml'] },
    { name: 'gemini', files: ['.gemini/settings.json'] }
  ];

  async detectAgents(projectPath: string): Promise<AgentConfig[]> {
    const results: AgentConfig[] = [];

    for (const config of this.agentConfigs) {
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

  private async checkAgentFiles(
    projectPath: string, 
    files: string[]
  ): Promise<{ found: boolean; path?: string }> {
    for (const file of files) {
      const fullPath = resolve(projectPath, file);
      if (await fileExists(fullPath)) {
        return { found: true, path: fullPath };
      }
    }
    return { found: false };
  }

  async detectAgentByName(projectPath: string, agentName: string): Promise<AgentConfig | null> {
    const config = this.agentConfigs.find(c => c.name === agentName);
    if (!config) return null;

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