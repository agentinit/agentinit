import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { countTokens } from 'contextcalc';
import { green, yellow, red } from 'kleur/colors';
import type { 
  MCPServerConfig, 
  MCPVerificationResult, 
  MCPCapabilities,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPServerType
} from '../types/index.js';

export class MCPVerificationError extends Error {
  constructor(message: string, public readonly serverName: string) {
    super(message);
    this.name = 'MCPVerificationError';
  }
}

export class MCPVerifier {
  private defaultTimeout: number;

  constructor(defaultTimeout: number = 10000) {
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Color utility function for token display
   */
  private colorizeTokenCount(tokenCount: number): string {
    if (tokenCount <= 5000) return green(tokenCount.toString());
    if (tokenCount <= 15000) return yellow(tokenCount.toString());
    return red(tokenCount.toString());
  }

  /**
   * Calculate token counts for MCP tools
   */
  private calculateToolTokens(tools: MCPTool[]): { toolTokenCounts: Map<string, number>; totalToolTokens: number } {
    const toolTokenCounts = new Map<string, number>();
    let totalToolTokens = 0;

    for (const tool of tools) {
      try {
        // Create a simplified object for token counting
        const toolForCounting = {
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {}
        };
        
        // Count tokens for this tool
        const toolText = JSON.stringify(toolForCounting, null, 2);
        const tokenCount = countTokens(toolText);
        
        toolTokenCounts.set(tool.name, tokenCount);
        totalToolTokens += tokenCount;
      } catch (error) {
        // If token counting fails for a specific tool, default to 0
        console.warn(`Failed to count tokens for tool ${tool.name}:`, error);
        toolTokenCounts.set(tool.name, 0);
      }
    }

    return { toolTokenCounts, totalToolTokens };
  }

  /**
   * Verify a single MCP server
   */
  async verifyServer(server: MCPServerConfig, timeout?: number): Promise<MCPVerificationResult> {
    const startTime = Date.now();
    const timeoutMs = timeout || this.defaultTimeout;

    try {
      // Create the appropriate transport based on server type
      const transport = await this.createTransport(server);
      
      // Create the MCP client
      const client = new Client({
        name: "agentinit-verifier",
        version: "1.0.0"
      });

      // Set up timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Connect to the server with timeout
      const connectPromise = this.connectAndVerify(client, transport, server);
      
      const capabilities = await Promise.race([connectPromise, timeoutPromise]);
      const connectionTime = Date.now() - startTime;

      return {
        server,
        status: 'success',
        capabilities,
        connectionTime
      };

    } catch (error) {
      const connectionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        server,
        status: connectionTime >= timeoutMs ? 'timeout' : 'error',
        error: errorMessage,
        connectionTime
      };
    }
  }

  /**
   * Verify multiple MCP servers
   */
  async verifyServers(servers: MCPServerConfig[], timeout?: number): Promise<MCPVerificationResult[]> {
    const results = await Promise.allSettled(
      servers.map(server => this.verifyServer(server, timeout))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const server = servers[index];
        if (!server) {
          throw new Error(`Server at index ${index} is undefined`);
        }
        return {
          server,
          status: 'error' as const,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
        };
      }
    });
  }

  /**
   * Create the appropriate transport for the server type
   */
  private async createTransport(server: MCPServerConfig) {
    switch (server.type) {
      case 'stdio':
        if (!server.command) {
          throw new MCPVerificationError('STDIO server missing command', server.name);
        }
        
        const isDebugMode = process.env.DEBUG === '1';
        
        // Filter out undefined values from process.env
        const cleanEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            cleanEnv[key] = value;
          }
        }
        
        return new StdioClientTransport({
          command: server.command,
          args: server.args || [],
          env: server.env ? { ...cleanEnv, ...server.env } : cleanEnv,
          stderr: isDebugMode ? 'inherit' : 'ignore'
        });

      case 'http':
        if (!server.url) {
          throw new MCPVerificationError('HTTP server missing URL', server.name);
        }
        return new StreamableHTTPClientTransport(new URL(server.url));

      case 'sse':
        if (!server.url) {
          throw new MCPVerificationError('SSE server missing URL', server.name);
        }
        return new SSEClientTransport(new URL(server.url));

      default:
        throw new MCPVerificationError(`Unsupported server type: ${server.type}`, server.name);
    }
  }

  /**
   * Connect to the server and retrieve capabilities
   */
  private async connectAndVerify(
    client: Client, 
    transport: any, 
    server: MCPServerConfig
  ): Promise<MCPCapabilities> {
    try {
      // Connect to the server
      await client.connect(transport);

      // Get server info
      const serverInfo = {
        name: server.name,
        version: "unknown",
        protocolVersion: "unknown"
      };

      // List tools
      const tools: MCPTool[] = [];
      try {
        const toolsResponse = await client.listTools();
        tools.push(...toolsResponse.tools.map(tool => {
          const mcpTool: MCPTool = { name: tool.name };
          if (tool.description !== undefined) mcpTool.description = tool.description;
          if (tool.inputSchema !== undefined) mcpTool.inputSchema = tool.inputSchema;
          return mcpTool;
        }));
      } catch (error) {
        // Tools might not be supported, continue
      }

      // List resources
      const resources: MCPResource[] = [];
      try {
        const resourcesResponse = await client.listResources();
        resources.push(...resourcesResponse.resources.map(resource => {
          const mcpResource: MCPResource = { uri: resource.uri };
          if (resource.name !== undefined) mcpResource.name = resource.name;
          if (resource.description !== undefined) mcpResource.description = resource.description;
          if (resource.mimeType !== undefined) mcpResource.mimeType = resource.mimeType;
          return mcpResource;
        }));
      } catch (error) {
        // Resources might not be supported, continue
      }

      // List prompts
      const prompts: MCPPrompt[] = [];
      try {
        const promptsResponse = await client.listPrompts();
        prompts.push(...promptsResponse.prompts.map(prompt => {
          const mcpPrompt: MCPPrompt = { name: prompt.name };
          if (prompt.description !== undefined) mcpPrompt.description = prompt.description;
          if (prompt.arguments !== undefined) {
            // Filter and transform arguments to match our type
            mcpPrompt.arguments = prompt.arguments.map(arg => {
              const mcpArg: { name: string; description?: string; required?: boolean } = { name: arg.name };
              if (arg.description !== undefined) mcpArg.description = arg.description;
              if (arg.required !== undefined) mcpArg.required = arg.required;
              return mcpArg;
            });
          }
          return mcpPrompt;
        }));
      } catch (error) {
        // Prompts might not be supported, continue
      }

      // Calculate token counts for tools
      const { toolTokenCounts, totalToolTokens } = this.calculateToolTokens(tools);

      return {
        tools,
        resources,
        prompts,
        serverInfo,
        toolTokenCounts,
        totalToolTokens
      };

    } finally {
      // Clean up the connection
      try {
        await client.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Format verification results for display
   */
  formatResults(results: MCPVerificationResult[]): string {
    const isDebugMode = process.env.DEBUG === '1';
    const output: string[] = [];

    for (const result of results) {
      const { server, status, capabilities, error, connectionTime } = result;
      
      if (status === 'success' && capabilities) {
        output.push(`✅ MCP Server: ${server.name} (${server.type.toUpperCase()})`);
        output.push(`   Status: Connected successfully (${connectionTime}ms)`);
        
        if (capabilities.serverInfo) {
          output.push(`   Version: ${capabilities.serverInfo.version}`);
        }
        
        if (capabilities.tools.length > 0) {
          const totalTokensDisplay = capabilities.totalToolTokens 
            ? ` - ${this.colorizeTokenCount(capabilities.totalToolTokens)} tokens`
            : '';
          output.push(`   \n   Tools (${capabilities.tools.length})${totalTokensDisplay}:`);
          
          capabilities.tools.forEach(tool => {
            const tokenCount = capabilities.toolTokenCounts?.get(tool.name) || 0;
            const tokenDisplay = tokenCount > 0 ? ` (${tokenCount} tokens)` : '';
            output.push(`   • ${tool.name}${tokenDisplay}${tool.description ? ` - ${tool.description}` : ''}`);
          });
        }
        
        // Only show resources and prompts in debug mode
        if (isDebugMode && capabilities.resources.length > 0) {
          output.push(`   \n   Resources (${capabilities.resources.length}):`);
          capabilities.resources.forEach(resource => {
            const resourceName = resource.name || resource.uri.split('/').pop() || resource.uri;
            output.push(`   • ${resourceName}${resource.description ? ` - ${resource.description}` : ''}`);
          });
        }
        
        if (isDebugMode && capabilities.prompts.length > 0) {
          output.push(`   \n   Prompts (${capabilities.prompts.length}):`);
          capabilities.prompts.forEach(prompt => {
            output.push(`   • ${prompt.name}${prompt.description ? ` - ${prompt.description}` : ''}`);
          });
        }
        
        if (capabilities.tools.length === 0 && capabilities.resources.length === 0 && capabilities.prompts.length === 0) {
          output.push(`   ⚠️  No tools, resources, or prompts available`);
        }
        
      } else {
        const statusIcon = status === 'timeout' ? '⏱️' : '❌';
        output.push(`${statusIcon} MCP Server: ${server.name} (${server.type.toUpperCase()})`);
        output.push(`   Status: ${status === 'timeout' ? 'Connection timeout' : 'Failed'} (${connectionTime || 0}ms)`);
        if (error) {
          output.push(`   Error: ${error}`);
        }
        
        // Show connection details for debugging
        if (server.type === 'stdio' && server.command) {
          output.push(`   Command: ${server.command} ${server.args?.join(' ') || ''}`);
        } else if (server.url) {
          output.push(`   URL: ${server.url}`);
        }
      }
      
      output.push(''); // Empty line between servers
    }

    return output.join('\n');
  }
}