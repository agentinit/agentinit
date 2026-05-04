import { promises as fs } from 'fs';
import { resolve } from 'path';
import { fileExists, readFileIfExists, writeFile, createRelativeSymlink } from '../utils/fs.js';

export interface AgentsMdSection {
  heading: string;
  body: string;
  level: number;
}

interface ParsedSection extends AgentsMdSection {
  startLine: number;
  endLine: number;
}

export interface SetSectionOptions {
  heading: string;
  body: string;
  placement?: 'append' | 'prepend' | 'after <heading>';
}

export interface RemoveSectionOptions {
  heading: string;
}

export class AgentsMdManager {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  private getAgentsMdPath(): string {
    return resolve(this.projectPath, 'AGENTS.md');
  }

  private getClaudeMdPath(): string {
    return resolve(this.projectPath, 'CLAUDE.md');
  }

  /**
   * Read AGENTS.md content, or null if it doesn't exist.
   */
  async read(): Promise<string | null> {
    return readFileIfExists(this.getAgentsMdPath());
  }

  /**
   * Parse sections from markdown content.
   * Returns array of sections with heading level, heading text, and body.
   */
  parseSections(content: string): AgentsMdSection[] {
    return this.parseSectionsWithRanges(content).map(({ heading, body, level }) => ({
      heading,
      body,
      level,
    }));
  }

  private parseSectionsWithRanges(content: string): ParsedSection[] {
    const lines = content.split('\n');
    const sections: ParsedSection[] = [];
    let currentHeading: string | null = null;
    let currentLevel = 0;
    let currentStartLine = 0;
    let currentBodyLines: string[] = [];

    function flushSection(endLine: number) {
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          body: currentBodyLines.join('\n').trimEnd(),
          level: currentLevel,
          startLine: currentStartLine,
          endLine,
        });
      }
    }

    for (const [index, line] of lines.entries()) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushSection(index);
        currentLevel = headingMatch[1]!.length;
        currentHeading = headingMatch[2]!.trim();
        currentStartLine = index;
        currentBodyLines = [];
      } else if (currentHeading !== null) {
        currentBodyLines.push(line);
      }
    }

    flushSection(lines.length);
    return sections;
  }

  /**
   * Find a section by heading (case-insensitive).
   */
  findSection(sections: AgentsMdSection[], heading: string): AgentsMdSection | undefined {
    const normalized = heading.trim().toLowerCase();
    return sections.find(s => s.heading.trim().toLowerCase() === normalized);
  }

  /**
   * Set (upsert) a section in AGENTS.md.
   * If section exists, replaces body. If not, appends (or prepends).
   */
  async setSection(options: SetSectionOptions): Promise<void> {
    const agentsMdPath = this.getAgentsMdPath();
    const content = (await readFileIfExists(agentsMdPath)) || '';
    const sections = this.parseSectionsWithRanges(content);
    const existingIndex = sections.findIndex(
      s => s.heading.trim().toLowerCase() === options.heading.trim().toLowerCase()
    );

    const lines = this.contentLines(content);
    const sectionText = this.serializeSection({
      heading: options.heading,
      body: options.body,
      level: existingIndex >= 0 ? sections[existingIndex]!.level : 2,
    });

    if (existingIndex >= 0) {
      const existing = sections[existingIndex]!;
      if (existing.endLine < lines.length && lines[existing.endLine - 1] === '') {
        sectionText.push('');
      }
      lines.splice(existing.startLine, existing.endLine - existing.startLine, ...sectionText);
    } else {
      const insertion = this.sectionInsertionLines(lines, sectionText, options.placement);

      if (options.placement?.startsWith('after ')) {
        const afterHeading = options.placement.slice(6).trim();
        const afterIndex = sections.findIndex(
          s => s.heading.trim().toLowerCase() === afterHeading.toLowerCase()
        );
        if (afterIndex >= 0) {
          lines.splice(sections[afterIndex]!.endLine, 0, ...insertion);
        } else {
          lines.push(...insertion);
        }
      } else if (options.placement === 'prepend') {
        lines.unshift(...insertion);
      } else {
        lines.push(...insertion);
      }
    }

    await writeFile(agentsMdPath, this.joinContentLines(lines));
  }

  /**
   * Remove a section from AGENTS.md by heading.
   * Returns true if section was found and removed.
   */
  async removeSection(options: RemoveSectionOptions): Promise<boolean> {
    const agentsMdPath = this.getAgentsMdPath();
    const content = await readFileIfExists(agentsMdPath);
    if (!content) return false;

    const sections = this.parseSectionsWithRanges(content);
    const index = sections.findIndex(
      s => s.heading.trim().toLowerCase() === options.heading.trim().toLowerCase()
    );

    if (index < 0) return false;

    const lines = this.contentLines(content);
    const section = sections[index]!;
    lines.splice(section.startLine, section.endLine - section.startLine);
    await writeFile(agentsMdPath, this.joinContentLines(lines));
    return true;
  }

  /**
   * Create a symlink CLAUDE.md -> AGENTS.md (or reverse if preferred).
   * Removes existing CLAUDE.md if it exists.
   */
  async symlinkClaude(): Promise<void> {
    const agentsMdPath = this.getAgentsMdPath();
    const claudeMdPath = this.getClaudeMdPath();

    if (!(await fileExists(agentsMdPath))) {
      throw new Error('AGENTS.md does not exist. Run `agentinit init` first.');
    }

    // Remove existing CLAUDE.md (file or symlink)
    try {
      const stats = await fs.lstat(claudeMdPath);
      if (stats.isSymbolicLink() || stats.isFile()) {
        await fs.rm(claudeMdPath, { force: true });
      }
    } catch {
      // File doesn't exist, that's fine
    }

    const created = await createRelativeSymlink(agentsMdPath, claudeMdPath);
    if (!created) {
      throw new Error('Failed to create symlink from CLAUDE.md to AGENTS.md');
    }
  }

  /**
   * Serialize one section to markdown lines.
   */
  private serializeSection(section: AgentsMdSection): string[] {
    const lines = [`${'#'.repeat(section.level)} ${section.heading}`];
    if (section.body) {
      lines.push(...section.body.replace(/\n$/, '').split('\n'));
    }
    return lines;
  }

  private sectionInsertionLines(
    existingLines: string[],
    sectionLines: string[],
    placement: SetSectionOptions['placement'],
  ): string[] {
    const insertion = [...sectionLines];
    const hasExistingContent = existingLines.some(line => line.trim());
    if (!hasExistingContent) {
      return insertion;
    }

    if (placement === 'prepend') {
      return [...insertion, ''];
    }

    return ['', ...insertion];
  }

  private contentLines(content: string): string[] {
    if (!content) {
      return [];
    }
    return content.replace(/\n$/, '').split('\n');
  }

  private joinContentLines(lines: string[]): string {
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }
}
