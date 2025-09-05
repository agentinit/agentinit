import * as TOML from '@iarna/toml';

/**
 * Configuration file merging utility
 * Handles merging of JSON and TOML configuration files
 */
export class ConfigMerger {
  /**
   * Merge JSON configurations
   * Deep merges objects, arrays are replaced entirely
   */
  static mergeJSON(existing: any, newData: any): any {
    if (!existing) return newData;
    if (!newData) return existing;

    const merged = { ...existing };

    for (const [key, value] of Object.entries(newData)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value) && 
          merged[key] && typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
        // Deep merge objects
        merged[key] = this.mergeJSON(merged[key], value);
      } else {
        // Replace primitive values and arrays
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Merge TOML configurations
   * Similar to JSON merge but handles TOML-specific formatting
   */
  static mergeTOML(existingToml: string, newData: any): string {
    let existingConfig: any = {};

    if (existingToml && existingToml.trim()) {
      try {
        existingConfig = TOML.parse(existingToml);
      } catch (error) {
        console.warn('Warning: Existing TOML configuration is invalid, starting fresh');
        existingConfig = {};
      }
    }

    const merged = this.mergeJSON(existingConfig, newData);
    return TOML.stringify(merged);
  }

  /**
   * Safely parse JSON with error handling
   */
  static parseJSON(jsonString: string, fallback: any = {}): any {
    if (!jsonString || !jsonString.trim()) {
      return fallback;
    }

    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn('Warning: Invalid JSON, using fallback value');
      return fallback;
    }
  }

  /**
   * Safely parse TOML with error handling
   */
  static parseTOML(tomlString: string, fallback: any = {}): any {
    if (!tomlString || !tomlString.trim()) {
      return fallback;
    }

    try {
      return TOML.parse(tomlString);
    } catch (error) {
      console.warn('Warning: Invalid TOML, using fallback value');
      return fallback;
    }
  }

  /**
   * Format JSON with standard formatting
   */
  static formatJSON(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Format TOML with custom formatting for better readability
   */
  static formatTOML(data: any, options: { 
    header?: string; 
    sectionSeparator?: boolean;
    compactArrays?: boolean;
  } = {}): string {
    let tomlString = TOML.stringify(data);
    
    if (options.compactArrays) {
      tomlString = this.compactArrays(tomlString);
    }

    const lines = tomlString.split('\n');
    const formattedLines: string[] = [];
    
    // Add header if provided
    if (options.header) {
      formattedLines.push(`# ${options.header}`);
      formattedLines.push('# Generated automatically by agentinit');
      formattedLines.push('');
    }

    let lastWasSection = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        // Section header
        if (options.sectionSeparator && lastWasSection) {
          formattedLines.push(''); // Add blank line between sections
        }
        formattedLines.push(trimmedLine);
        lastWasSection = true;
      } else if (trimmedLine) {
        formattedLines.push(trimmedLine);
        lastWasSection = false;
      }
    }

    return formattedLines.join('\n') + '\n';
  }

  /**
   * Convert multi-line arrays to single-line format in TOML
   */
  private static compactArrays(tomlString: string): string {
    return tomlString.replace(
      /(\w+)\s*=\s*\[\s*\n((?:\s*[^[\]]+,?\s*\n)*)\s*\]/g,
      (match, key, content) => {
        const items = content
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && line !== '')
          .map((line: string) => line.replace(/,$/, '').trim())
          .filter((item: string) => item);
        
        if (items.length > 0) {
          return `${key} = [${items.join(', ')}]`;
        }
        return `${key} = []`;
      }
    );
  }

  /**
   * Deep clone an object (utility method)
   */
  static deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
    
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  /**
   * Merge arrays with deduplication
   */
  static mergeArrays(existing: any[], newItems: any[], keyField?: string): any[] {
    if (!Array.isArray(existing)) existing = [];
    if (!Array.isArray(newItems)) return existing;

    if (!keyField) {
      // Simple deduplication
      return [...new Set([...existing, ...newItems])];
    }

    // Deduplication by key field
    const merged = [...existing];
    const existingKeys = new Set(existing.map(item => item[keyField]));

    for (const newItem of newItems) {
      if (!existingKeys.has(newItem[keyField])) {
        merged.push(newItem);
        existingKeys.add(newItem[keyField]);
      }
    }

    return merged;
  }
}