import { promises as fs } from 'fs';
import { resolve } from 'path';
import matter from 'gray-matter';
import * as yaml from 'js-yaml';
import { copyFile, createRelativeSymlink, fileExists, readFileIfExists, readSymlinkTarget, writeFile } from '../utils/fs.js';
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
  warnings: string[];
  resolvedTargets: string[];
}

interface SyncOutput {
  path: string;
  kind?: 'file' | 'symlink';
  content?: string;
  target?: string;
  ignorePath?: string;
}

interface AgentAdapter {
  buildOutputs(projectPath: string, content: string): Promise<SyncOutput[]>;
}

interface GeneratedFile {
  path: string;
  kind: 'file' | 'symlink';
  content?: string;
  target?: string;
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

function parseRulesAlias(value: unknown): 'agents' | null {
  return typeof value === 'string' && value.trim().toLowerCase() === 'agents'
    ? 'agents'
    : null;
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
      warnings: [],
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
      const rulesAlias = parseRulesAlias(parsed.data.rules_alias);
      result.resolvedTargets = targets;

      const generatedFiles = await this.buildGeneratedFiles(projectPath, parsed.content, targets, rulesAlias);

      for (const generatedFile of generatedFiles) {
        try {
          const syncResult = await this.writeGeneratedFile(projectPath, generatedFile, options);
          result.changes.push(...syncResult.changes);
          result.warnings.push(...syncResult.warnings);
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
    rulesAlias: 'agents' | null,
  ): Promise<GeneratedFile[]> {
    const generatedFiles = new Map<string, GeneratedFile>();

    if (rulesAlias === 'agents' && targets.includes('claude')) {
      this.mergeGeneratedFile(projectPath, generatedFiles, {
        path: 'AGENTS.md',
        kind: 'file',
        content,
      }, 'claude');

      this.mergeGeneratedFile(projectPath, generatedFiles, {
        path: 'CLAUDE.md',
        kind: 'symlink',
        target: 'AGENTS.md',
        content,
      }, 'claude');
    }

    for (const target of targets) {
      if (target === 'claude' && rulesAlias === 'agents') {
        continue;
      }

      const adapter = this.agentAdapters.get(target);
      if (!adapter) {
        throw new Error(`No adapter found for agent: ${target}`);
      }

      const outputs = await adapter.buildOutputs(projectPath, content);
      for (const output of outputs) {
        this.mergeGeneratedFile(projectPath, generatedFiles, output, target);
      }
    }

    return [...generatedFiles.values()];
  }

  private mergeGeneratedFile(
    projectPath: string,
    generatedFiles: Map<string, GeneratedFile>,
    output: SyncOutput,
    agentId: string,
  ): void {
    const outputPath = resolve(projectPath, output.path);
    const nextKind = output.kind ?? 'file';
    const nextContent = nextKind === 'file' || output.content !== undefined
      ? normalizeContent(output.content || '')
      : undefined;
    const existing = generatedFiles.get(outputPath);

    if (existing) {
      if (existing.kind !== nextKind) {
        throw new Error(`Conflicting generated output type for ${output.path}`);
      }
      if (existing.target !== output.target) {
        throw new Error(`Conflicting generated symlink target for ${output.path}`);
      }
      if (existing.content !== nextContent) {
        throw new Error(`Conflicting generated content for ${output.path}`);
      }
      existing.agents.push(agentId);
      return;
    }

    generatedFiles.set(outputPath, {
      path: outputPath,
      kind: nextKind,
      agents: [agentId],
      ignorePath: output.ignorePath ?? output.path,
      ...(nextContent !== undefined ? { content: nextContent } : {}),
      ...(output.target !== undefined ? { target: output.target } : {}),
    });
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
      warnings: [],
      resolvedTargets: [],
    };

    const exists = await fileExists(generatedFile.path);
    const existingStats = exists ? await fs.lstat(generatedFile.path).catch(() => null) : null;
    const existingContent = exists && !existingStats?.isSymbolicLink()
      ? await readFileIfExists(generatedFile.path)
      : null;
    const existingTarget = existingStats?.isSymbolicLink()
      ? await readSymlinkTarget(generatedFile.path)
      : null;

    if (options.managedState && !options.dryRun) {
      await options.managedState.trackGeneratedPath(generatedFile.path, {
        kind: 'file',
        source: 'sync',
        ignorePath: resolve(projectPath, generatedFile.ignorePath),
      });
    }

    if (
      generatedFile.kind === 'file' &&
      exists &&
      !existingStats?.isSymbolicLink() &&
      existingContent === generatedFile.content
    ) {
      return result;
    }

    if (
      generatedFile.kind === 'symlink' &&
      exists &&
      existingStats?.isSymbolicLink() &&
      existingTarget === generatedFile.target
    ) {
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
      if (generatedFile.kind === 'file') {
        if (existingStats?.isSymbolicLink()) {
          await fs.rm(generatedFile.path, { force: true }).catch(() => {});
        }
        await writeFile(generatedFile.path, generatedFile.content || '');
      } else {
        const symlinkCreated = await createRelativeSymlink(
          resolve(projectPath, generatedFile.target || ''),
          generatedFile.path,
        );

        if (!symlinkCreated) {
          await writeFile(generatedFile.path, generatedFile.content || '');
          result.warnings.push(
            `Could not create symlink for ${generatedFile.path}; wrote a copied file instead.`,
          );
        }
      }
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
