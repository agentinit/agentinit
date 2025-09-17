import { resolve } from 'path';
import { countTokens } from 'contextcalc';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { Agent } from '../agents/Agent.js';
import type { AppliedRules, RuleApplicationResult } from '../types/rules.js';

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
        ? agent.getGlobalMcpPath()
        : this.getAgentRulesPath(agent, projectPath);

      if (!configPath) {
        return {
          success: false,
          rulesApplied: 0,
          agent: agent.name,
          configPath: '',
          errors: [`Could not determine config path for ${agent.name}`]
        };
      }

      // Get existing sections and rules before applying new ones using agent methods
      const existingContent = await readFileIfExists(configPath) || '';
      const existingSections = agent.extractExistingSections(existingContent);
      const existingRules = agent.extractExistingRules(existingContent);
      const previousTokenCount = this.countRulesTokens(existingRules);

      // Merge new sections with existing ones
      const mergedSections = this.mergeSections(existingSections, rules.sections);
      const allMergedRules = mergedSections.flatMap(section => section.rules);

      // Determine which rules are new vs existing
      const existingSet = new Set(existingRules);
      const newlyApplied = allMergedRules.filter(rule => !existingSet.has(rule));
      const existing = allMergedRules.filter(rule => existingSet.has(rule));

      // Apply rules based on agent type using merged sections
      await this.applyRulesByAgentType(agent, allMergedRules, configPath, mergedSections);

      // Count tokens in the applied rules (now using merged rules)
      const tokenCount = this.countRulesTokens(allMergedRules);
      const tokenDiff = tokenCount - previousTokenCount;
      
      // Count total file tokens after applying rules
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
        newlyApplied: newlyApplied,
        existingCount: existing.length,
        newlyAppliedCount: newlyApplied.length,
        mergedSections: mergedSections
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
  private async applyRulesByAgentType(agent: Agent, rules: string[], configPath: string, sections?: any[]): Promise<void> {
    await ensureDirectoryExists(configPath);
    
    const existing = await readFileIfExists(configPath) || '';
    
    // Create AppliedRules object for the agent
    const appliedRules: AppliedRules = {
      templateRules: rules,
      rawRules: [],
      fileRules: [],
      remoteRules: [],
      merged: rules,
      sections: sections || []
    };
    
    // Delegate to agent-specific implementation
    const newContent = await agent.applyRulesConfig(configPath, appliedRules, existing);
    
    // Write the new content
    await writeFile(configPath, newContent);
  }



  /**
   * Merge new sections with existing ones
   */
  private mergeSections(existingSections: any[], newSections: any[]): any[] {
    const merged = new Map();

    // Add all existing sections
    for (const section of existingSections) {
      merged.set(section.templateId, {
        templateId: section.templateId,
        templateName: section.templateName,
        rules: [...section.rules]
      });
    }

    // Add or merge new sections
    for (const section of newSections) {
      if (merged.has(section.templateId)) {
        // Merge rules, deduplicating
        const existing = merged.get(section.templateId);
        const allRules = [...existing.rules, ...section.rules];
        const uniqueRules = [...new Set(allRules)];
        merged.set(section.templateId, {
          ...existing,
          rules: uniqueRules
        });
      } else {
        // Add new section
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
      // Join all rules with bullet points as they would appear in the config
      const rulesText = rules.map(rule => `- ${rule}`).join('\n');
      return countTokens(rulesText);
    } catch (error) {
      // If token counting fails, return 0 to avoid breaking the functionality
      console.warn('Failed to count tokens:', error);
      return 0;
    }
  }

  /**
   * Get the appropriate rules config path for an agent
   */
  private getAgentRulesPath(agent: Agent, projectPath: string): string {
    // Use the same path as the agent's native config for rules
    // Each agent will handle rules in their own config file
    switch (agent.id) {
      case 'claude':
        return resolve(projectPath, 'CLAUDE.md');
      case 'cursor':
        return resolve(projectPath, '.cursorrules');
      case 'claude-desktop':
        return resolve(projectPath, '.claude_desktop_config.json');
      default:
        return resolve(projectPath, `${agent.id}_rules.md`);
    }
  }
}