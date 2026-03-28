import { countTokens } from 'contextcalc';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { Agent } from '../agents/Agent.js';
import type { AppliedRules, RuleApplicationResult, RuleSection } from '../types/rules.js';

export class RulesApplicator {

  /**
   * Apply rules to an agent's configuration
   */
  async applyRulesToAgent(
    agent: Agent,
    rules: AppliedRules,
    projectPath: string,
    isGlobal: boolean = false
  ): Promise<RuleApplicationResult> {
    try {
      if (!agent.capabilities.rules) {
        return {
          success: false,
          rulesApplied: 0,
          agent: agent.name,
          configPath: '',
          errors: [`Agent ${agent.name} does not support rules`]
        };
      }

      const configPath = isGlobal
        ? agent.getGlobalRulesPath()
        : agent.getProjectRulesPath(projectPath);

      if (!configPath) {
        return {
          success: false,
          rulesApplied: 0,
          agent: agent.name,
          configPath: '',
          errors: [`Could not determine config path for ${agent.name}`]
        };
      }

      const existingContent = await readFileIfExists(configPath) || '';
      const existingSections = agent.extractExistingSections(existingContent);
      const existingRules = agent.extractExistingRules(existingContent);
      const previousTokenCount = this.countRulesTokens(existingRules);

      const mergedSections = this.mergeSections(existingSections, rules.sections);
      const allMergedRules = mergedSections.flatMap(section => section.rules);

      const existingSet = new Set(existingRules);
      const newlyApplied = allMergedRules.filter(rule => !existingSet.has(rule));
      const existing = allMergedRules.filter(rule => existingSet.has(rule));

      await this.applyRulesByAgentType(agent, allMergedRules, configPath, mergedSections);

      const tokenCount = this.countRulesTokens(allMergedRules);
      const tokenDiff = tokenCount - previousTokenCount;
      const totalFileTokens = await this.countTotalFileTokens(configPath);

      return {
        success: true,
        rulesApplied: allMergedRules.length,
        agent: agent.name,
        configPath,
        tokenCount,
        tokenDiff,
        totalFileTokens,
        existingRules: existing,
        newlyApplied,
        existingCount: existing.length,
        newlyAppliedCount: newlyApplied.length,
        mergedSections
      };
    } catch (error) {
      return {
        success: false,
        rulesApplied: 0,
        agent: agent.name,
        configPath: '',
        errors: [`Failed to apply rules to ${agent.name}: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Apply rules using agent-specific methods
   */
  private async applyRulesByAgentType(
    agent: Agent,
    rules: string[],
    configPath: string,
    sections?: RuleSection[]
  ): Promise<void> {
    await ensureDirectoryExists(configPath);

    const existing = await readFileIfExists(configPath) || '';
    const appliedRules: AppliedRules = {
      templateRules: rules,
      rawRules: [],
      fileRules: [],
      remoteRules: [],
      merged: rules,
      sections: sections || []
    };

    const newContent = await agent.applyRulesConfig(configPath, appliedRules, existing);
    await writeFile(configPath, newContent);
  }

  /**
   * Merge new sections with existing ones
   */
  private mergeSections(existingSections: RuleSection[], newSections: RuleSection[]): RuleSection[] {
    const merged = new Map<string, RuleSection>();

    for (const section of existingSections) {
      merged.set(section.templateId, {
        templateId: section.templateId,
        templateName: section.templateName,
        rules: [...section.rules]
      });
    }

    for (const section of newSections) {
      if (merged.has(section.templateId)) {
        const existing = merged.get(section.templateId);
        if (!existing) {
          continue;
        }

        const allRules = [...existing.rules, ...section.rules];
        merged.set(section.templateId, {
          ...existing,
          rules: [...new Set(allRules)]
        });
      } else {
        merged.set(section.templateId, {
          templateId: section.templateId,
          templateName: section.templateName,
          rules: [...section.rules]
        });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Count total tokens in the entire config file
   */
  private async countTotalFileTokens(configPath: string): Promise<number> {
    try {
      const fileContent = await readFileIfExists(configPath);
      if (!fileContent) return 0;

      return countTokens(fileContent);
    } catch (error) {
      console.warn('Failed to count total file tokens:', error);
      return 0;
    }
  }

  /**
   * Count tokens in the rules
   */
  private countRulesTokens(rules: string[]): number {
    try {
      if (rules.length === 0) return 0;
      const rulesText = rules.map(rule => `- ${rule}`).join('\n');
      return countTokens(rulesText);
    } catch (error) {
      console.warn('Failed to count tokens:', error);
      return 0;
    }
  }
}
