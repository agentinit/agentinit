import { Agent } from './Agent.js';
import type { AppliedRules, RuleSection } from '../types/rules.js';

/**
 * Shared markdown-section rule handling for agents that store instructions
 * as `## Section` headers followed by bullet rules.
 */
export abstract class MarkdownRulesAgent extends Agent {
  async applyRulesConfig(
    _configPath: string,
    rules: AppliedRules,
    existingContent: string
  ): Promise<string> {
    return this.replaceMarkdownRulesSections(existingContent, rules.sections, /^##\s+(.+)$/);
  }

  extractExistingRules(content: string): string[] {
    return this.extractExistingSections(content).flatMap(section => section.rules);
  }

  extractExistingSections(content: string): RuleSection[] {
    const lines = content.split('\n');
    const sections: RuleSection[] = [];
    let currentSection: RuleSection | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('## ') && trimmed.includes(' ')) {
        if (currentSection && currentSection.rules.length > 0) {
          sections.push(currentSection);
        }

        const sectionName = trimmed.replace(/^##\s*/, '');
        currentSection = {
          templateId: sectionName.toLowerCase().replace(/\s+/g, '_'),
          templateName: sectionName,
          rules: []
        };
      } else if (currentSection && trimmed.startsWith('- ')) {
        currentSection.rules.push(trimmed.replace(/^- /, ''));
      }
    }

    if (currentSection && currentSection.rules.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }

  generateRulesContent(sections: RuleSection[]): string {
    let content = '';

    for (const section of sections) {
      if (section.rules.length === 0) continue;

      content += `## ${section.templateName}\n`;
      for (const rule of section.rules) {
        content += `- ${rule}\n`;
      }
      content += '\n';
    }

    return content.trim();
  }
}
