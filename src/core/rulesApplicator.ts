import { resolve } from 'path';
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

      // Apply rules based on agent type
      await this.applyRulesByAgentType(agent, rules.merged, configPath);

      return {
        success: true,
        rulesApplied: rules.merged.length,
        agent: agent.name,
        configPath
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
   * Apply rules based on the specific agent type
   */
  private async applyRulesByAgentType(agent: Agent, rules: string[], configPath: string): Promise<void> {
    switch (agent.id) {
      case 'claude':
        await this.applyRulesToClaudeAgent(rules, configPath);
        break;
      case 'cursor':
        await this.applyRulesToCursorAgent(rules, configPath);
        break;
      case 'claude-desktop':
        await this.applyRulesToClaudeDesktopAgent(rules, configPath);
        break;
      default:
        // Generic markdown format for other agents
        await this.applyRulesToGenericAgent(rules, configPath);
        break;
    }
  }

  /**
   * Apply rules to Claude agent (CLAUDE.md format)
   */
  private async applyRulesToClaudeAgent(rules: string[], configPath: string): Promise<void> {
    await ensureDirectoryExists(configPath);
    
    const existing = await readFileIfExists(configPath) || '';
    const rulesSection = this.generateMarkdownRulesSection(rules);
    
    let content = existing;
    
    // Check if rules section already exists
    const rulesSectionRegex = /## AgentInit Rules\s*[\s\S]*?(?=\n## |$)/;
    
    if (rulesSectionRegex.test(content)) {
      // Replace existing rules section
      content = content.replace(rulesSectionRegex, rulesSection.trim());
    } else {
      // Append rules section
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += '\n' + rulesSection;
    }
    
    await writeFile(configPath, content.trim() + '\n');
  }

  /**
   * Apply rules to Cursor agent (.cursorrules format)
   */
  private async applyRulesToCursorAgent(rules: string[], configPath: string): Promise<void> {
    await ensureDirectoryExists(configPath);
    
    const existing = await readFileIfExists(configPath) || '';
    const rulesSection = this.generateCursorRulesSection(rules);
    
    let content = existing;
    
    // Check if AgentInit rules section already exists
    const rulesSectionRegex = /\/\/ AgentInit Rules[\s\S]*?\/\/ Rules managed by AgentInit\. Do not edit this section manually\.[\s\S]*?(?=\n[^\s\/]|$)/;
    
    if (rulesSectionRegex.test(content)) {
      // Replace existing rules section
      content = content.replace(rulesSectionRegex, rulesSection.trim());
    } else {
      // Append rules section
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += '\n' + rulesSection;
    }
    
    await writeFile(configPath, content.trim() + '\n');
  }

  /**
   * Apply rules to Claude Desktop agent (JSON format)
   */
  private async applyRulesToClaudeDesktopAgent(rules: string[], configPath: string): Promise<void> {
    await ensureDirectoryExists(configPath);
    
    const existing = await readFileIfExists(configPath);
    let config: any = {};
    
    if (existing) {
      try {
        config = JSON.parse(existing);
      } catch (error) {
        console.warn('Warning: Existing config is invalid JSON, creating new configuration');
      }
    }
    
    // Add rules to the agentinit_rules section
    config.agentinit_rules = rules;
    
    await writeFile(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Apply rules to generic agent (markdown format)
   */
  private async applyRulesToGenericAgent(rules: string[], configPath: string): Promise<void> {
    await ensureDirectoryExists(configPath);
    
    const existing = await readFileIfExists(configPath) || '';
    const rulesSection = this.generateMarkdownRulesSection(rules);
    
    let content = existing;
    
    // Check if rules section already exists
    const rulesSectionRegex = /## AgentInit Rules\s*[\s\S]*?(?=\n## |$)/;
    
    if (rulesSectionRegex.test(content)) {
      // Replace existing rules section
      content = content.replace(rulesSectionRegex, rulesSection.trim());
    } else {
      // Append rules section
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += '\n' + rulesSection;
    }
    
    await writeFile(configPath, content.trim() + '\n');
  }

  /**
   * Generate markdown rules section
   */
  private generateMarkdownRulesSection(rules: string[]): string {
    let section = '## AgentInit Rules\n\n';
    
    for (const rule of rules) {
      section += `- ${rule}\n`;
    }
    
    section += '\n---\n*Rules managed by AgentInit. Do not edit this section manually.*\n';
    
    return section;
  }

  /**
   * Generate Cursor rules section
   */
  private generateCursorRulesSection(rules: string[]): string {
    let section = '// AgentInit Rules\n';
    
    for (const rule of rules) {
      section += `// - ${rule}\n`;
    }
    
    section += '\n// Rules managed by AgentInit. Do not edit this section manually.\n';
    
    return section;
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