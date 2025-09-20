import { MCPServerConfig, MCPServerType, MCPCommandParsed } from '../types/index.js';

export class MCPParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPParseError';
  }
}

export class MCPParser {
  /**
   * Parse command line arguments to extract MCP server configurations
   */
  static parseArguments(args: string[]): MCPCommandParsed {
    const servers: MCPServerConfig[] = [];
    let i = 0;

    while (i < args.length) {
      const arg = args[i];

      if (arg === '--mcp-stdio') {
        const result = this.parseStdioMCP(args, i);
        if (result.server) {
          servers.push(result.server);
        }
        i = result.nextIndex;
      } else if (arg === '--mcp-http') {
        const result = this.parseHttpMCP(args, i);
        if (result.server) {
          servers.push(result.server);
        }
        i = result.nextIndex;
      } else if (arg === '--mcp-sse') {
        const result = this.parseSSEMCP(args, i);
        if (result.server) {
          servers.push(result.server);
        }
        i = result.nextIndex;
      } else {
        i++;
      }
    }

    return { servers };
  }

  private static parseStdioMCP(args: string[], startIndex: number): { server: MCPServerConfig | null; nextIndex: number } {
    let i = startIndex + 1;
    
    if (i >= args.length) {
      return { server: null, nextIndex: i };
    }

    const serverName = args[i];
    if (!serverName) {
      return { server: null, nextIndex: i + 1 };
    }
    
    // Validate that the name doesn't look like a command (old syntax)
    if (this.looksLikeCommand(serverName)) {
      throw new MCPParseError(
        `Invalid MCP name: "${serverName}"\n` +
        `The name appears to be a command. New syntax requires explicit names:\n` +
        `  Correct: --mcp-stdio myname "npx -y @package/name"\n` +
        `  Incorrect: --mcp-stdio "npx -y @package/name"`
      );
    }
    
    i++;
    
    if (i >= args.length) {
      throw new MCPParseError(
        `Missing command for MCP server "${serverName}"\n` +
        `Usage: --mcp-stdio <name> <command>`
      );
    }

    const commandStr = args[i];
    if (!commandStr) {
      return { server: null, nextIndex: i + 1 };
    }
    i++;

    // Parse command and initial args
    const [command, ...initialArgs] = this.parseCommand(commandStr);
    if (!command) {
      return { server: null, nextIndex: i };
    }

    const server: MCPServerConfig = {
      name: serverName,
      type: MCPServerType.STDIO,
      command,
      args: [...initialArgs],
      env: {}
    };

    // Look for --args and --env modifiers
    while (i < args.length) {
      const nextArg = args[i];
      if (!nextArg) {
        i++;
        continue;
      }
      
      if (nextArg === '--args' && i + 1 < args.length) {
        const argsStr = args[i + 1];
        if (argsStr) {
          const additionalArgs = this.parseArgsString(argsStr);
          server.args = [...(server.args || []), ...additionalArgs];
        }
        i += 2;
      } else if (nextArg === '--env' && i + 1 < args.length) {
        const envStr = args[i + 1];
        if (envStr) {
          const envVars = this.parseEnvString(envStr);
          server.env = { ...server.env, ...envVars };
        }
        i += 2;
      } else if (nextArg.startsWith('--mcp-')) {
        // Next MCP command, stop parsing this one
        break;
      } else {
        i++;
      }
    }

    return { server, nextIndex: i };
  }

  private static parseHttpMCP(args: string[], startIndex: number): { server: MCPServerConfig | null; nextIndex: number } {
    let i = startIndex + 1;
    
    if (i >= args.length) {
      return { server: null, nextIndex: i };
    }

    const serverName = args[i];
    if (!serverName) {
      return { server: null, nextIndex: i + 1 };
    }
    
    // Validate that the name doesn't look like a URL (old syntax)
    if (this.looksLikeUrl(serverName)) {
      throw new MCPParseError(
        `Invalid MCP name: "${serverName}"\n` +
        `The name appears to be a URL. New syntax requires explicit names:\n` +
        `  Correct: --mcp-http myname "https://example.com/mcp"\n` +
        `  Incorrect: --mcp-http "https://example.com/mcp"`
      );
    }
    
    i++;
    
    if (i >= args.length) {
      throw new MCPParseError(
        `Missing URL for MCP server "${serverName}"\n` +
        `Usage: --mcp-http <name> <url>`
      );
    }

    const url = args[i];
    if (!url) {
      return { server: null, nextIndex: i + 1 };
    }
    i++;

    const server: MCPServerConfig = {
      name: serverName,
      type: MCPServerType.HTTP,
      url,
      headers: {}
    };

    // Look for --auth and --header modifiers
    while (i < args.length) {
      const nextArg = args[i];
      if (!nextArg) {
        i++;
        continue;
      }
      
      if (nextArg === '--auth' && i + 1 < args.length) {
        const authHeader = args[i + 1];
        if (authHeader) {
          if (authHeader.startsWith('Bearer ')) {
            server.headers!['Authorization'] = authHeader;
          } else {
            server.headers!['Authorization'] = `Bearer ${authHeader}`;
          }
        }
        i += 2;
      } else if (nextArg === '--header' && i + 1 < args.length) {
        const headerStr = args[i + 1];
        if (headerStr) {
          const colonIndex = headerStr.indexOf(':');
          if (colonIndex > 0 && colonIndex < headerStr.length - 1) {
            const key = headerStr.substring(0, colonIndex).trim();
            const value = headerStr.substring(colonIndex + 1).trim();
            if (key && value) {
              server.headers![key] = value;
            }
          }
        }
        i += 2;
      } else if (nextArg.startsWith('--mcp-')) {
        // Next MCP command, stop parsing this one
        break;
      } else {
        i++;
      }
    }

    return { server, nextIndex: i };
  }

  private static parseSSEMCP(args: string[], startIndex: number): { server: MCPServerConfig | null; nextIndex: number } {
    let i = startIndex + 1;
    
    if (i >= args.length) {
      return { server: null, nextIndex: i };
    }

    const serverName = args[i];
    if (!serverName) {
      return { server: null, nextIndex: i + 1 };
    }
    
    // Validate that the name doesn't look like a URL (old syntax)
    if (this.looksLikeUrl(serverName)) {
      throw new MCPParseError(
        `Invalid MCP name: "${serverName}"\n` +
        `The name appears to be a URL. New syntax requires explicit names:\n` +
        `  Correct: --mcp-sse myname "https://example.com/sse"\n` +
        `  Incorrect: --mcp-sse "https://example.com/sse"`
      );
    }
    
    i++;
    
    if (i >= args.length) {
      throw new MCPParseError(
        `Missing URL for MCP server "${serverName}"\n` +
        `Usage: --mcp-sse <name> <url>`
      );
    }

    const url = args[i];
    if (!url) {
      return { server: null, nextIndex: i + 1 };
    }
    i++;

    const server: MCPServerConfig = {
      name: serverName,
      type: MCPServerType.SSE,
      url
    };

    // Skip to next MCP command
    while (i < args.length && !args[i]?.startsWith('--mcp-')) {
      i++;
    }

    return { server, nextIndex: i };
  }

  private static parseCommand(commandStr: string): string[] {
    // Handle quoted arguments in command string
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < commandStr.length; i++) {
      const char = commandStr[i];
      
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          parts.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  private static parseArgsString(argsStr: string): string[] {
    return this.parseCommand(argsStr);
  }

  private static parseEnvString(envStr: string): Record<string, string> {
    const env: Record<string, string> = {};
    
    // Handle format like: "KEY1=value1 KEY2=value2" or "KEY=value"
    const pairs = envStr.split(' ').filter(pair => pair.includes('='));
    
    for (const pair of pairs) {
      const [key, ...valueParts] = pair.split('=');
      const value = valueParts.join('='); // Handle values with = in them
      if (key && value !== undefined) {
        env[key] = value;
      }
    }

    return env;
  }

  /**
   * Check if a string looks like a command (indicates old syntax usage)
   */
  private static looksLikeCommand(name: string): boolean {
    const commandPatterns = [
      /^(npx|npm|node|docker|python|pip|cargo|go)\s/,  // Starts with common commands
      /\s/,                                            // Contains spaces (likely a command string)
      /^["'].*["']$/,                                  // Wrapped in quotes (likely a command string)
    ];
    
    return commandPatterns.some(pattern => pattern.test(name));
  }

  /**
   * Check if a string looks like a URL (indicates old syntax usage)
   */
  private static looksLikeUrl(name: string): boolean {
    const urlPatterns = [
      /^https?:\/\//,           // Starts with http:// or https://
      /^localhost:\d+/,         // Starts with localhost:port
      /\.[a-z]{2,}(\/|$)/i,     // Contains domain-like pattern (.com, .org, etc.)
    ];
    
    return urlPatterns.some(pattern => pattern.test(name));
  }

}