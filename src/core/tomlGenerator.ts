import * as TOML from '@iarna/toml';
import { MCPServerConfig, MCPServerType, TomlMCPServer } from '../types/index.js';

export class TOMLGenerator {
  /**
   * Generate TOML configuration from MCP server configurations
   */
  static generateTOML(servers: MCPServerConfig[]): string {
    const config: any = {
      mcp_servers: {}
    };

    for (const server of servers) {
      const tomlServer: any = {};

      switch (server.type) {
        case MCPServerType.STDIO:
          if (server.command) {
            tomlServer.command = server.command;
          }
          if (server.args) {
            tomlServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            tomlServer.env = server.env;
          }
          break;

        case MCPServerType.HTTP:
        case MCPServerType.SSE:
          if (server.url) {
            tomlServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            tomlServer.headers = server.headers;
          }
          break;
      }

      config.mcp_servers[server.name] = tomlServer;
    }

    return this.formatTOML(TOML.stringify(config));
  }

  /**
   * Format TOML output for better readability
   */
  private static formatTOML(tomlString: string): string {
    // Use TOML library's compact formatting but add our header
    const config = TOML.parse(tomlString);
    const compactToml = TOML.stringify(config);
    
    // Convert multi-line arrays to single-line format
    const inlineArrayToml = this.formatArraysInline(compactToml);
    
    const lines = inlineArrayToml.split('\n');
    const formattedLines: string[] = [];
    
    // Add header comment
    formattedLines.push('# AgentInit MCP Configuration');
    formattedLines.push('# Generated automatically by agentinit');
    formattedLines.push('');
    formattedLines.push('# --- MCP Server Definitions ---');

    let inServerBlock = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('[mcp_servers.')) {
        if (inServerBlock) {
          formattedLines.push(''); // Add blank line between servers
        }
        inServerBlock = true;
        formattedLines.push(trimmedLine);
      } else if (trimmedLine) {
        formattedLines.push(trimmedLine);
      }
    }

    return formattedLines.join('\n') + '\n';
  }

  /**
   * Convert multi-line arrays to single-line format
   */
  private static formatArraysInline(tomlString: string): string {
    // Use regex to replace all array patterns
    return tomlString.replace(
      /(\w+)\s*=\s*\[\s*([^\]]*)\s*\]/g, 
      (match, key, content) => {
        // Handle single-line arrays with extra spaces: key = [ "item1", "item2" ]
        if (content.includes('"') || content.includes("'")) {
          const items = this.parseArrayItems(content);
          return `${key} = [${items.join(', ')}]`;
        }
        // Empty or whitespace-only arrays
        return `${key} = []`;
      }
    ).replace(
      /(\w+)\s*=\s*\[\s*\n((?:\s*[^[\]]+,?\s*\n)*)\s*\]/g,
      (match, key, content) => {
        // Handle multi-line arrays: key = [\n  "item1",\n  "item2"\n]
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
   * Parse array items from a comma-separated string
   */
  private static parseArrayItems(content: string): string[] {
    const items: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      if ((char === '"' || char === "'") && (i === 0 || content[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
          current += char;
        } else if (char === quoteChar) {
          inQuotes = false;
          current += char;
        } else {
          current += char;
        }
      } else if (char === ',' && !inQuotes) {
        if (current.trim()) {
          items.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      items.push(current.trim());
    }
    
    return items;
  }

  /**
   * Merge new servers with existing TOML configuration
   */
  static mergeTOML(existingToml: string, newServers: MCPServerConfig[]): string {
    let existingConfig: any = {};

    if (existingToml.trim()) {
      try {
        existingConfig = TOML.parse(existingToml);
      } catch (error) {
        // If existing TOML is invalid, start fresh
        console.warn('Warning: Existing TOML configuration is invalid, creating new configuration');
      }
    }

    // Ensure mcp_servers section exists
    if (!existingConfig.mcp_servers) {
      existingConfig.mcp_servers = {};
    }

    // Add new servers
    for (const server of newServers) {
      const tomlServer: any = {};

      switch (server.type) {
        case MCPServerType.STDIO:
          if (server.command) {
            tomlServer.command = server.command;
          }
          if (server.args) {
            tomlServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            tomlServer.env = server.env;
          }
          break;

        case MCPServerType.HTTP:
        case MCPServerType.SSE:
          if (server.url) {
            tomlServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            tomlServer.headers = server.headers;
          }
          break;
      }

      existingConfig.mcp_servers[server.name] = tomlServer;
    }

    return this.formatTOML(TOML.stringify(existingConfig));
  }
}