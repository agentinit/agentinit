import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { fileExists, readFileIfExists, writeFile, createRelativeSymlink } from '../utils/fs.js';

export interface AgentsMdSection {
  heading: string;
  body: string;
  level: number;
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
    const lines = content.split('\n');
    const sections: AgentsMdSection[] = [];
    let currentHeading: string | null = null;
    let currentLevel = 0;
    let currentBodyLines: string[] = [];

    function flushSection() {
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          body: currentBodyLines.join('\n').trimEnd(),
          level: currentLevel,
        });
      }
    }

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushSection();
        currentLevel = headingMatch[1].length;
        currentHeading = headingMatch[2].trim();
        currentBodyLines = [];
      } else if (currentHeading !== null) {
        currentBodyLines.push(line);
      }
    }

    flushSection();
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
    const sections = this.parseSections(content);
    const existingIndex = sections.findIndex(
      s => s.heading.trim().toLowerCase() === options.heading.trim().toLowerCase()
    );

    let newContent: string;

    if (existingIndex >= 0) {
      // Replace existing section body
      sections[existingIndex].body = options.body;
      newContent = this.serializeSections(sections);
    } else {
      // Append new section
      const newSection: AgentsMdSection = {
        heading: options.heading,
        body: options.body,
        level: 2,
      };

      if (options.placement?.startsWith('after ')) {
        const afterHeading = options.placement.slice(6).trim();
        const afterIndex = sections.findIndex(
          s => s.heading.trim().toLowerCase() === afterHeading.toLowerCase()
        );
        if (afterIndex >= 0) {
          sections.splice(afterIndex + 1, 0, newSection);
        } else {
          sections.push(newSection);
        }
      } else if (options.placement === 'prepend') {
        sections.unshift(newSection);
      } else {
        sections.push(newSection);
      }
      newContent = this.serializeSections(sections);
    }

    await writeFile(agentsMdPath, newContent);
  }

  /**
   * Remove a section from AGENTS.md by heading.
   * Returns true if section was found and removed.
   */
  async removeSection(options: RemoveSectionOptions): Promise<boolean> {
    const agentsMdPath = this.getAgentsMdPath();
    const content = await readFileIfExists(agentsMdPath);
    if (!content) return false;

    const sections = this.parseSections(content);
    const index = sections.findIndex(
      s => s.heading.trim().toLowerCase() === options.heading.trim().toLowerCase()
    );

    if (index < 0) return false;

    sections.splice(index, 1);
    await writeFile(agentsMdPath, this.serializeSections(sections));
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
   * Serialize sections back to markdown string.
   */
  private serializeSections(sections: AgentsMdSection[]): string {
    const parts: string[] = [];
    for (const section of sections) {
      parts.push(`${'#'.repeat(section.level)} ${section.heading}`);
      if (section.body) {
        parts.push(section.body);
      }
      parts.push('');
    }
    return parts.join('\n').trimEnd() + '\n';
  }
}
