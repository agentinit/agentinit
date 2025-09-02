import { MCPServerConfig, MCPServerType, MCPCommandParsed } from '../types/index.js';

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
    
    if (i + 1 >= args.length) {
      return { server: null, nextIndex: i };
    }

    const serverName = args[i];
    if (!serverName) {
      return { server: null, nextIndex: i + 1 };
    }
    i++;

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
    
    if (i + 1 >= args.length) {
      return { server: null, nextIndex: i };
    }

    const serverName = args[i];
    if (!serverName) {
      return { server: null, nextIndex: i + 1 };
    }
    i++;

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

    // Look for --auth modifier
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
    
    if (i + 1 >= args.length) {
      return { server: null, nextIndex: i };
    }

    const serverName = args[i];
    if (!serverName) {
      return { server: null, nextIndex: i + 1 };
    }
    i++;

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

}