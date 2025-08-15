import { resolve, dirname } from 'path';
import matter from 'gray-matter';
import { fileExists, readFileIfExists, writeFile, copyFile } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import type { AgentConfig } from '../types/index.js';

export interface SyncOptions {
  dryRun?: boolean;
  backup?: boolean;
}

export interface SyncResult {
  success: boolean;
  changes: Array<{
    agent: string;
    action: 'created' | 'updated' | 'backed_up';
    file: string;
  }>;
  errors: string[];
}

export class Propagator {
  private readonly agentAdapters = new Map<string, AgentAdapter>();

  constructor() {
    this.initializeAdapters();
  }

  async syncAgentsFile(projectPath: string, options: SyncOptions = {}): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      changes: [],
      errors: []
    };

    const agentsPath = resolve(projectPath, 'agents.md');
    
    if (!await fileExists(agentsPath)) {
      result.success = false;
      result.errors.push('agents.md not found. Run `agentinit init` first.');
      return result;
    }

    try {
      const agentsContent = await readFileIfExists(agentsPath);
      if (!agentsContent) {
        result.errors.push('Failed to read agents.md');
        result.success = false;
        return result;
      }

      const parsed = matter(agentsContent);
      const targets = parsed.data.targets || this.getDefaultTargets();

      for (const target of targets) {
        const adapter = this.agentAdapters.get(target);
        if (!adapter) {
          result.errors.push(`No adapter found for agent: ${target}`);
          continue;
        }

        try {
          const syncResult = await this.syncAgent(
            projectPath, 
            target, 
            adapter, 
            parsed.content,
            options
          );
          
          result.changes.push(...syncResult.changes);
          
          if (!syncResult.success) {
            result.errors.push(...syncResult.errors);
          }
        } catch (error) {
          result.errors.push(`Failed to sync ${target}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.success = result.errors.length === 0;
      
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to parse agents.md: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  private async syncAgent(
    projectPath: string,
    agentName: string,
    adapter: AgentAdapter,
    content: string,
    options: SyncOptions
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      changes: [],
      errors: []
    };

    const targetPath = resolve(projectPath, adapter.configPath);
    const agentContent = adapter.transformContent(content);

    // Create backup if requested and file exists
    if (options.backup && await fileExists(targetPath)) {
      const backupPath = `${targetPath}.agentinit.backup`;
      if (!options.dryRun) {
        await copyFile(targetPath, backupPath);
      }
      result.changes.push({
        agent: agentName,
        action: 'backed_up',
        file: backupPath
      });
    }

    const exists = await fileExists(targetPath);
    const action = exists ? 'updated' : 'created';

    if (!options.dryRun) {
      await writeFile(targetPath, agentContent);
    }

    result.changes.push({
      agent: agentName,
      action,
      file: targetPath
    });

    return result;
  }

  private getDefaultTargets(): string[] {
    return ['claude', 'cursor'];
  }

  private initializeAdapters(): void {
    this.agentAdapters.set('claude', {
      configPath: 'CLAUDE.md',
      transformContent: (content: string) => this.formatForClaude(content)
    });

    this.agentAdapters.set('cursor', {
      configPath: '.cursorrules',
      transformContent: (content: string) => this.formatForCursor(content)
    });

    this.agentAdapters.set('windsurf', {
      configPath: '.windsurfrules',
      transformContent: (content: string) => this.formatForWindsurf(content)
    });
  }

  private formatForClaude(content: string): string {
    return `# Claude Configuration

${content}

## Additional Claude-Specific Instructions

- Use Claude's long-form thinking when needed for complex problems
- Provide detailed explanations for complex code
- Break down large tasks into smaller, manageable steps
- Use Claude's code analysis capabilities effectively
`;
  }

  private formatForCursor(content: string): string {
    // Convert markdown to a more concise format for Cursor
    const lines = content.split('\n');
    const rules: string[] = [];

    let inCodeBlock = false;
    
    for (const line of lines) {
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      
      if (inCodeBlock) continue;
      
      if (line.startsWith('### ') || line.startsWith('## ')) {
        rules.push(`\n// ${line.replace(/#+\s/, '')}`);
      } else if (line.startsWith('- ')) {
        rules.push(`// ${line.substring(2)}`);
      } else if (line.trim() && !line.startsWith('#') && !line.startsWith('*')) {
        rules.push(`// ${line}`);
      }
    }

    return rules.join('\n').replace(/\n\n+/g, '\n\n');
  }

  private formatForWindsurf(content: string): string {
    return `// Windsurf Configuration
// Generated from agents.md

${content}

// Windsurf-Specific Notes:
// - Use Windsurf's AI pair programming features
// - Leverage real-time collaboration capabilities
// - Follow Windsurf's code suggestion patterns
`;
  }
}

interface AgentAdapter {
  configPath: string;
  transformContent: (content: string) => string;
}