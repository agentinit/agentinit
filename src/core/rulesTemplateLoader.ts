import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync, existsSync } from 'fs';
import TOML from '@iarna/toml';
import type { RuleTemplate } from '../types/rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RuleTomlData {
  template: {
    id: string;
    name: string;
    description: string;
    category: 'workflow' | 'quality' | 'testing' | 'documentation';
    priority?: number;
  };
  rules: Array<{ text: string }>;
}

export class RulesTemplateLoader {
  private readonly templatesPath: string;
  private templates: Map<string, RuleTemplate> = new Map();

  constructor() {
    // In the built version, templates will be next to the bundle
    this.templatesPath = resolve(__dirname, 'templates/rules');
    this.loadTemplates();
  }

  /**
   * Load all rule templates from TOML files
   */
  private loadTemplates(): void {
    if (!existsSync(this.templatesPath)) {
      throw new Error(`Rules templates directory not found: ${this.templatesPath}`);
    }

    const files = readdirSync(this.templatesPath).filter(file => file.endsWith('.toml'));
    
    for (const file of files) {
      try {
        const filePath = resolve(this.templatesPath, file);
        const content = readFileSync(filePath, 'utf-8');
        const parsed = TOML.parse(content) as unknown as RuleTomlData;

        const template: RuleTemplate = {
          id: parsed.template.id,
          name: parsed.template.name,
          description: parsed.template.description,
          category: parsed.template.category,
          priority: parsed.template.priority || 5,
          rules: parsed.rules.map(rule => rule.text)
        };

        this.templates.set(template.id, template);
      } catch (error) {
        console.warn(`Failed to load rule template from ${file}:`, error);
      }
    }
  }

  /**
   * Get a rule template by ID
   */
  getTemplate(id: string): RuleTemplate | null {
    return this.templates.get(id) || null;
  }

  /**
   * Get all available rule templates
   */
  getAllTemplates(): RuleTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: RuleTemplate['category']): RuleTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.category === category);
  }

  /**
   * Check if a template exists
   */
  hasTemplate(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Get available template IDs
   */
  getAvailableTemplateIds(): string[] {
    return Array.from(this.templates.keys());
  }
}