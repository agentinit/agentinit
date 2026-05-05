import { promises as fs } from 'fs';
import { resolve } from 'path';
import { fileExists, readFileIfExists, writeFile, createRelativeSymlink } from '../utils/fs.js';

export interface AgentsMdSection {
  heading: string;
  body: string;
  level: number;
}

export interface SetSectionOptions {
  heading: string;
  body: string;
  placement?: 'append' | 'prepend' | `after ${string}`;
}

export interface RemoveSectionOptions {
  heading: string;
}

interface AgentsMdSectionRange extends AgentsMdSection {
  start: number;
  headingEnd: number;
  end: number;
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
   * Read per-agent variant (CLAUDE.md, .cursorrules, etc.), or null.
   */
  async readAgentFile(agentFileName: string): Promise<string | null> {
    return readFileIfExists(resolve(this.projectPath, agentFileName));
  }

  /**
   * Parse sections from markdown content.
   * Returns array of sections with heading level, heading text, and body.
   */
  parseSections(content: string): AgentsMdSection[] {
    return this.parseSectionRanges(content).map(({ heading, body, level }) => ({
      heading,
      body,
      level,
    }));
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
    const heading = this.normalizeHeadingInput(options.heading);
    const content = ((await readFileIfExists(agentsMdPath)) || '').replace(/\r\n/g, '\n');
    const sections = this.parseSectionRanges(content);
    const placement = this.parsePlacement(options.placement);
    const existing = this.findSectionRange(sections, heading);

    let newContent: string;

    if (existing) {
      newContent = `${content.slice(0, existing.start)}${this.renderSection(
        existing.level,
        existing.heading,
        options.body,
      )}${content.slice(existing.end)}`;
    } else {
      const newSection = this.renderSection(2, heading, options.body);
      if (placement.type === 'after') {
        const after = this.findSectionRange(sections, placement.heading);
        newContent = after
          ? this.insertSection(content, after.end, newSection)
          : this.insertSection(content, content.length, newSection);
      } else if (placement.type === 'prepend') {
        newContent = this.insertSection(content, 0, newSection);
      } else {
        newContent = this.insertSection(content, content.length, newSection);
      }
    }

    await writeFile(agentsMdPath, this.ensureTrailingNewline(newContent));
  }

  /**
   * Remove a section from AGENTS.md by heading.
   * Returns true if section was found and removed.
   */
  async removeSection(options: RemoveSectionOptions): Promise<boolean> {
    const agentsMdPath = this.getAgentsMdPath();
    const content = await readFileIfExists(agentsMdPath);
    if (!content) return false;

    const normalizedContent = content.replace(/\r\n/g, '\n');
    const section = this.findSectionRange(
      this.parseSectionRanges(normalizedContent),
      this.normalizeHeadingInput(options.heading),
    );

    if (!section) return false;

    const before = normalizedContent.slice(0, section.start).trimEnd();
    const after = normalizedContent.slice(section.end).trimStart();
    const newContent = [before, after].filter(Boolean).join('\n');
    await writeFile(agentsMdPath, this.ensureTrailingNewline(newContent));
    return true;
  }

  /**
   * Create a symlink CLAUDE.md -> AGENTS.md.
   * Refuses to overwrite a real CLAUDE.md because it may contain user-authored rules.
   */
  async symlinkClaude(): Promise<void> {
    const agentsMdPath = this.getAgentsMdPath();
    const claudeMdPath = this.getClaudeMdPath();

    if (!(await fileExists(agentsMdPath))) {
      throw new Error('AGENTS.md does not exist. Create AGENTS.md first.');
    }

    try {
      const stats = await fs.lstat(claudeMdPath);
      if (!stats.isSymbolicLink()) {
        throw new Error('CLAUDE.md already exists and is not a symlink. Move or remove it before creating the alias.');
      }
    } catch (error) {
      if (!this.isMissingPathError(error)) {
        throw error;
      }
    }

    const created = await createRelativeSymlink(agentsMdPath, claudeMdPath);
    if (!created) {
      throw new Error('Failed to create symlink from CLAUDE.md to AGENTS.md');
    }
  }

  private parseSectionRanges(content: string): AgentsMdSectionRange[] {
    const sections: Omit<AgentsMdSectionRange, 'end' | 'body'>[] = [];
    const headingPattern = /^(#{1,6})[ \t]+(.+?)\s*$/gm;
    let match: RegExpExecArray | null;

    while ((match = headingPattern.exec(content)) !== null) {
      const lineEndIndex = content.indexOf('\n', match.index);
      sections.push({
        heading: match[2]!.trim(),
        level: match[1]!.length,
        start: match.index,
        headingEnd: lineEndIndex === -1 ? content.length : lineEndIndex + 1,
      });
    }

    return sections.map((section, index) => {
      const nextPeerOrParent = sections.slice(index + 1).find(next => next.level <= section.level);
      const end = nextPeerOrParent?.start ?? content.length;
      return {
        ...section,
        end,
        body: content.slice(section.headingEnd, end).trimEnd(),
      };
    });
  }

  private findSectionRange(
    sections: AgentsMdSectionRange[],
    heading: string,
  ): AgentsMdSectionRange | undefined {
    const normalized = this.normalizeHeading(heading);
    return sections.find(s => this.normalizeHeading(s.heading) === normalized);
  }

  private normalizeHeadingInput(heading: string): string {
    const normalized = heading.trim();
    if (!normalized || normalized.includes('\n') || normalized.includes('\r')) {
      throw new Error('Section heading must be a single non-empty line');
    }
    return normalized;
  }

  private normalizeHeading(heading: string): string {
    return heading.trim().toLowerCase();
  }

  private parsePlacement(placement: SetSectionOptions['placement']): (
    { type: 'append' } | { type: 'prepend' } | { type: 'after'; heading: string }
  ) {
    if (!placement || placement === 'append') {
      return { type: 'append' };
    }
    if (placement === 'prepend') {
      return { type: 'prepend' };
    }
    if (placement.startsWith('after ')) {
      return { type: 'after', heading: this.normalizeHeadingInput(placement.slice(6)) };
    }
    throw new Error('Placement must be "append", "prepend", or "after <heading>"');
  }

  private renderSection(level: number, heading: string, body: string): string {
    const normalizedBody = body.replace(/\r\n/g, '\n').trimEnd();
    return normalizedBody
      ? `${'#'.repeat(level)} ${heading}\n${normalizedBody}\n`
      : `${'#'.repeat(level)} ${heading}\n`;
  }

  private insertSection(content: string, index: number, renderedSection: string): string {
    const before = content.slice(0, index).trimEnd();
    const after = content.slice(index).trimStart();

    if (!before && !after) {
      return renderedSection;
    }
    if (!before) {
      return `${renderedSection}\n${after}`;
    }
    if (!after) {
      return `${before}\n\n${renderedSection}`;
    }
    return `${before}\n\n${renderedSection}\n${after}`;
  }

  private ensureTrailingNewline(content: string): string {
    if (!content.trim()) {
      return '';
    }
    return content.endsWith('\n') ? content : `${content}\n`;
  }

  private isMissingPathError(error: unknown): boolean {
    return !!error
      && typeof error === 'object'
      && 'code' in error
      && (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}
