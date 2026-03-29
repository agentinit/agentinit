import { resolve } from 'path';
import matter from 'gray-matter';
import * as yaml from 'js-yaml';
import { copyFile, fileExists, readFileIfExists, writeFile } from '../utils/fs.js';
import { AgentDetector } from './agentDetector.js';
import type { ManagedStateStore } from './managedState.js';

export interface SyncOptions {
  dryRun?: boolean;
  backup?: boolean;
  targets?: string[];
  managedState?: ManagedStateStore;
}

export interface SyncResult {
  success: boolean;
  changes: Array<{
    agent: string;
    agents: string[];
    action: 'created' | 'updated' | 'backed_up';
    file: string;
  }>;
  errors: string[];
  resolvedTargets: string[];
}

interface SyncOutput {
  path: string;
  content: string;
  ignorePath?: string;
}

interface AgentAdapter {
  buildOutputs(projectPath: string, content: string): Promise<SyncOutput[]>;
}

interface GeneratedFile {
  path: string;
  content: string;
  agents: string[];
  ignorePath: string;
}

function normalizeContent(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function parseTargets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  return [];
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
      errors: [],
      resolvedTargets: [],
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
        result.success = false;
        result.errors.push('Failed to read agents.md');
        return result;
      }

      const parsed = matter(agentsContent);
      const targets = await this.resolveTargets(projectPath, options.targets, parsed.data.targets);
      result.resolvedTargets = targets;

      const generatedFiles = await this.buildGeneratedFiles(projectPath, parsed.content, targets);

      for (const generatedFile of generatedFiles) {
        try {
          const syncResult = await this.writeGeneratedFile(projectPath, generatedFile, options);
          result.changes.push(...syncResult.changes);
          if (!syncResult.success) {
            result.errors.push(...syncResult.errors);
          }
        } catch (error) {
          result.errors.push(`Failed to sync ${generatedFile.agents.join(', ')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to parse agents.md: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  private async resolveTargets(
    projectPath: string,
    explicitTargets?: string[],
    frontmatterTargets?: unknown,
  ): Promise<string[]> {
    if (explicitTargets && explicitTargets.length > 0) {
      return explicitTargets;
    }

    const parsedFrontmatterTargets = parseTargets(frontmatterTargets);
    if (parsedFrontmatterTargets.length > 0) {
      return parsedFrontmatterTargets;
    }

    const detector = new AgentDetector();
    const detectedAgents = await detector.detectAgents(projectPath);
    const detectedTargets = detectedAgents
      .filter(agent => agent.detected && this.agentAdapters.has(agent.name))
      .map(agent => agent.name);

    if (detectedTargets.length > 0) {
      return detectedTargets;
    }

    return this.getDefaultTargets();
  }

  private async buildGeneratedFiles(
    projectPath: string,
    content: string,
    targets: string[],
  ): Promise<GeneratedFile[]> {
    const generatedFiles = new Map<string, GeneratedFile>();

    for (const target of targets) {
      const adapter = this.agentAdapters.get(target);
      if (!adapter) {
        throw new Error(`No adapter found for agent: ${target}`);
      }

      const outputs = await adapter.buildOutputs(projectPath, content);
      for (const output of outputs) {
        const outputPath = resolve(projectPath, output.path);
        const existing = generatedFiles.get(outputPath);

        if (existing) {
          if (existing.content !== output.content) {
            throw new Error(`Conflicting generated content for ${output.path}`);
          }
          existing.agents.push(target);
          continue;
        }

        generatedFiles.set(outputPath, {
          path: outputPath,
          content: normalizeContent(output.content),
          agents: [target],
          ignorePath: output.ignorePath ?? output.path,
        });
      }
    }

    return [...generatedFiles.values()];
  }

  private async writeGeneratedFile(
    projectPath: string,
    generatedFile: GeneratedFile,
    options: SyncOptions,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      changes: [],
      errors: [],
      resolvedTargets: [],
    };

    const exists = await fileExists(generatedFile.path);
    const existingContent = exists ? await readFileIfExists(generatedFile.path) : null;

    if (options.managedState && !options.dryRun) {
      await options.managedState.trackGeneratedPath(generatedFile.path, {
        kind: 'file',
        source: 'sync',
        ignorePath: resolve(projectPath, generatedFile.ignorePath),
      });
    }

    if (exists && existingContent === generatedFile.content) {
      return result;
    }

    if (options.backup && exists) {
      const backupPath = `${generatedFile.path}.agentinit.backup`;
      if (!options.dryRun) {
        await copyFile(generatedFile.path, backupPath);
      }
      result.changes.push({
        agent: generatedFile.agents.join(', '),
        agents: [...generatedFile.agents],
        action: 'backed_up',
        file: backupPath,
      });
    }

    if (!options.dryRun) {
      await writeFile(generatedFile.path, generatedFile.content);
    }

    result.changes.push({
      agent: generatedFile.agents.join(', '),
      agents: [...generatedFile.agents],
      action: exists ? 'updated' : 'created',
      file: generatedFile.path,
    });

    return result;
  }

  private getDefaultTargets(): string[] {
    return ['claude', 'cursor'];
  }

  private initializeAdapters(): void {
    this.agentAdapters.set('claude', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: 'CLAUDE.md',
          content: this.formatForClaude(content),
        },
      ],
    });

    this.agentAdapters.set('cursor', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: 'AGENTS.md',
          content,
        },
      ],
    });

    this.agentAdapters.set('windsurf', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: '.windsurfrules',
          content: this.formatForWindsurf(content),
        },
      ],
    });

    this.agentAdapters.set('copilot', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: 'AGENTS.md',
          content,
        },
      ],
    });

    this.agentAdapters.set('cline', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: '.clinerules',
          content,
        },
      ],
    });

    this.agentAdapters.set('roo', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: 'AGENTS.md',
          content,
        },
      ],
    });

    this.agentAdapters.set('codex', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: 'AGENTS.md',
          content,
        },
      ],
    });

    this.agentAdapters.set('zed', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: 'AGENTS.md',
          content,
        },
      ],
    });

    this.agentAdapters.set('droid', {
      buildOutputs: async (_projectPath, content) => [
        {
          path: 'AGENTS.md',
          content,
        },
      ],
    });

    this.agentAdapters.set('aider', {
      buildOutputs: async (projectPath, content) => [
        {
          path: 'AGENTS.md',
          content,
        },
        {
          path: '.aider.conf.yml',
          content: await this.buildAiderConfig(projectPath),
        },
      ],
    });
  }

  private async buildAiderConfig(projectPath: string): Promise<string> {
    const configPath = resolve(projectPath, '.aider.conf.yml');
    const existingContent = await readFileIfExists(configPath);
    let document: Record<string, unknown> = {};

    if (existingContent) {
      try {
        document = (yaml.load(existingContent) as Record<string, unknown>) || {};
      } catch {
        document = {};
      }
    }

    const readEntries = Array.isArray(document.read)
      ? document.read.map(entry => String(entry))
      : [];

    if (!readEntries.includes('AGENTS.md')) {
      readEntries.push('AGENTS.md');
    }

    document.read = readEntries;
    return yaml.dump(document).trimEnd();
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
