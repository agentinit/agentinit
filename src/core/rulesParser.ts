import { readFileSync } from 'fs';
import { fileExists } from '../utils/fs.js';
import { RulesTemplateLoader } from './rulesTemplateLoader.js';
import type { RulesConfig, AppliedRules, RemoteRulesOptions } from '../types/rules.js';
import { DEFAULT_CONNECTION_TIMEOUT_MS } from '../constants/index.js';

export class RulesParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesParseError';
  }
}

export class RulesParser {
  private templateLoader: RulesTemplateLoader;

  constructor() {
    this.templateLoader = new RulesTemplateLoader();
  }

  /**
   * Parse command line arguments for rules configuration
   */
  static parseArguments(args: string[]): RulesConfig {
    const config: RulesConfig = {
      templates: [],
      rawRules: []
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--rules' && i + 1 < args.length) {
        const templatesStr = args[i + 1];
        if (templatesStr) {
          config.templates = templatesStr.split(',').map(t => t.trim()).filter(Boolean);
        }
        i++; // Skip next argument
      } else if (arg === '--rule-raw' && i + 1 < args.length) {
        const rawRule = args[i + 1];
        if (rawRule) {
          config.rawRules.push(rawRule);
        }
        i++; // Skip next argument
      } else if (arg === '--rules-file' && i + 1 < args.length) {
        const filePath = args[i + 1];
        if (filePath) {
          config.fileRules = filePath;
        }
        i++; // Skip next argument
      } else if (arg === '--rules-remote' && i + 1 < args.length) {
        const url = args[i + 1];
        let auth: string | undefined;
        
        // Check if next argument is auth
        if (i + 2 < args.length && args[i + 2] === '--auth' && i + 3 < args.length) {
          auth = args[i + 3];
          i += 2; // Skip --auth and its value
        }
        
        if (url) {
          config.remoteRules = auth ? { url, auth } : { url };
        }
        i++; // Skip URL argument
      }
    }

    return config;
  }

  /**
   * Process rules configuration and return merged rules
   */
  async processRules(config: RulesConfig): Promise<AppliedRules> {
    const result: AppliedRules = {
      templateRules: [],
      rawRules: config.rawRules || [],
      fileRules: [],
      remoteRules: [],
      merged: [],
      sections: []
    };

    // Process template rules and build sections
    for (const templateId of config.templates || []) {
      const template = this.templateLoader.getTemplate(templateId);
      if (!template) {
        throw new RulesParseError(`Unknown rule template: ${templateId}`);
      }
      result.templateRules.push(...template.rules);
      
      // Add section information
      result.sections.push({
        templateId: template.id,
        templateName: template.name,
        rules: template.rules
      });
    }

    // Process file rules
    if (config.fileRules) {
      result.fileRules = await this.loadRulesFromFile(config.fileRules);
      if (result.fileRules.length > 0) {
        result.sections.push({
          templateId: 'file_rules',
          templateName: 'File Rules',
          rules: result.fileRules
        });
      }
    }

    // Process remote rules
    if (config.remoteRules) {
      result.remoteRules = await this.loadRulesFromRemote(config.remoteRules);
      if (result.remoteRules.length > 0) {
        result.sections.push({
          templateId: 'remote_rules',
          templateName: 'Remote Rules',
          rules: result.remoteRules
        });
      }
    }

    // Process raw rules
    if (result.rawRules.length > 0) {
      result.sections.push({
        templateId: 'custom_rules',
        templateName: 'Custom Rules',
        rules: result.rawRules
      });
    }

    // Merge all rules and deduplicate
    const allRules = [
      ...result.templateRules,
      ...result.rawRules,
      ...result.fileRules,
      ...result.remoteRules
    ];

    result.merged = this.deduplicateRules(allRules);

    return result;
  }

  /**
   * Load rules from a local file
   */
  private async loadRulesFromFile(filePath: string): Promise<string[]> {
    if (!await fileExists(filePath)) {
      throw new RulesParseError(`Rules file not found: ${filePath}`);
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      
      // Try to detect file format and parse accordingly
      if (filePath.endsWith('.json')) {
        const parsed = JSON.parse(content);
        return this.extractRulesFromObject(parsed);
      } else if (filePath.endsWith('.toml')) {
        // Handle TOML files (could be rule templates or simple rule lists)
        const TOML = await import('@iarna/toml');
        const parsed = TOML.parse(content);
        return this.extractRulesFromObject(parsed);
      } else {
        // Treat as plain text with one rule per line
        return content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
          .map(line => line.replace(/^[-*]\s*/, '')); // Remove markdown list markers
      }
    } catch (error) {
      throw new RulesParseError(`Failed to parse rules file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load rules from a remote URL
   */
  private async loadRulesFromRemote(options: RemoteRulesOptions): Promise<string[]> {
    try {
      const headers: Record<string, string> = {};
      
      if (options.auth) {
        if (options.auth.startsWith('Bearer ')) {
          headers.Authorization = options.auth;
        } else {
          headers.Authorization = `Bearer ${options.auth}`;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || DEFAULT_CONNECTION_TIMEOUT_MS);

      const response = await fetch(options.url, {
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      
      // Try to parse as JSON first, then as plain text
      try {
        const parsed = JSON.parse(content);
        return this.extractRulesFromObject(parsed);
      } catch {
        // Treat as plain text
        return content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
          .map(line => line.replace(/^[-*]\s*/, ''));
      }
    } catch (error) {
      throw new RulesParseError(`Failed to fetch remote rules from ${options.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract rules from a parsed object (JSON/TOML)
   */
  private extractRulesFromObject(obj: any): string[] {
    if (Array.isArray(obj)) {
      return obj.map(item => typeof item === 'string' ? item : item.text || item.rule || String(item));
    }

    if (obj.rules && Array.isArray(obj.rules)) {
      return obj.rules.map((rule: any) => typeof rule === 'string' ? rule : rule.text || rule.rule || String(rule));
    }

    if (obj.template && obj.template.rules) {
      return this.extractRulesFromObject(obj.template.rules);
    }

    // If it's a flat object, try to extract string values
    const values = Object.values(obj).filter(value => typeof value === 'string');
    if (values.length > 0) {
      return values as string[];
    }

    throw new Error('Could not extract rules from object structure');
  }

  /**
   * Remove duplicate rules while preserving order
   */
  private deduplicateRules(rules: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const rule of rules) {
      const normalized = rule.trim().toLowerCase();
      if (!seen.has(normalized) && rule.trim()) {
        seen.add(normalized);
        result.push(rule.trim());
      }
    }

    return result;
  }

  /**
   * Get available rule templates
   */
  getAvailableTemplates() {
    return this.templateLoader.getAllTemplates();
  }

  /**
   * Validate template IDs
   */
  validateTemplateIds(templateIds: string[]): string[] {
    const invalid = templateIds.filter(id => !this.templateLoader.hasTemplate(id));
    return invalid;
  }
}