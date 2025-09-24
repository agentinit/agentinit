import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { countTokens } from 'contextcalc';
import { green, yellow, red } from 'kleur/colors';
import { MCPServerType } from '../types/index.js';
import { DEFAULT_CONNECTION_TIMEOUT_MS, MCP_VERIFIER_CONFIG, TimeoutError, TOKEN_COUNT_THRESHOLDS } from '../constants/index.js';
import type { 
  MCPServerConfig, 
  MCPVerificationResult, 
  MCPCapabilities,
  MCPTool,
  MCPResource,
  MCPPrompt
} from '../types/index.js';

export class MCPVerificationError extends Error {
  constructor(message: string, public readonly serverName: string) {
    super(message);
    this.name = 'MCPVerificationError';
  }
}

interface PackageInfo {
  name: string;
  version?: string | undefined;
}

/**
 * Parse a command string to extract package information for npx/uvx commands
 */
function parsePackageFromCommand(command: string, args: string[] = []): PackageInfo | null {
  const fullCommand = [command, ...args].join(' ');

  // Pattern 1: npx package-name@version
  const npxVersionMatch = fullCommand.match(/npx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*([^@\s]+)@([^\s]+)/);
  if (npxVersionMatch && npxVersionMatch[1] && npxVersionMatch[2]) {
    return { name: npxVersionMatch[1], version: npxVersionMatch[2] };
  }

  // Pattern 2: npx -y @scope/package@latest or npx @scope/package@latest
  const npxScopedMatch = fullCommand.match(/npx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*(@[^/]+\/[^@\s]+)(?:@([^\s]+))?/);
  if (npxScopedMatch && npxScopedMatch[1]) {
    return { name: npxScopedMatch[1], version: npxScopedMatch[2] || undefined };
  }

  // Pattern 3: npx package-name (without version)
  const npxMatch = fullCommand.match(/npx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*([^@\s]+)/);
  if (npxMatch && npxMatch[1]) {
    return { name: npxMatch[1] };
  }

  // Pattern 4: bunx package-name@version (same patterns as npx)
  const bunxVersionMatch = fullCommand.match(/bunx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*([^@\s]+)@([^\s]+)/);
  if (bunxVersionMatch && bunxVersionMatch[1] && bunxVersionMatch[2]) {
    return { name: bunxVersionMatch[1], version: bunxVersionMatch[2] };
  }

  // Pattern 5: bunx -y @scope/package@latest or bunx @scope/package@latest
  const bunxScopedMatch = fullCommand.match(/bunx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*(@[^/]+\/[^@\s]+)(?:@([^\s]+))?/);
  if (bunxScopedMatch && bunxScopedMatch[1]) {
    return { name: bunxScopedMatch[1], version: bunxScopedMatch[2] || undefined };
  }

  // Pattern 6: bunx package-name (without version)
  const bunxMatch = fullCommand.match(/bunx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*([^@\s]+)/);
  if (bunxMatch && bunxMatch[1]) {
    return { name: bunxMatch[1] };
  }

  // Pattern 7: pipx run --spec package==version binary
  const pipxSpecMatch = fullCommand.match(/pipx\s+run\s+--spec\s+([^=\s]+)==([^\s]+)/);
  if (pipxSpecMatch && pipxSpecMatch[1] && pipxSpecMatch[2]) {
    return { name: pipxSpecMatch[1], version: pipxSpecMatch[2] };
  }

  // Pattern 8: pipx run package-name (without version)
  const pipxMatch = fullCommand.match(/pipx\s+run\s+(?:--python\s+[^\s]+\s+)?([^@\s]+)/);
  if (pipxMatch && pipxMatch[1]) {
    return { name: pipxMatch[1] };
  }

  // Pattern 9: uvx package-name or uvx --from git+... package-name
  const uvxMatch = fullCommand.match(/uvx\s+(?:--from\s+[^\s]+\s+)?([^@\s]+)/);
  if (uvxMatch && uvxMatch[1]) {
    return { name: uvxMatch[1] };
  }

  return null;
}

/**
 * Fetch package version from npm registry
 */
async function fetchPackageVersionFromNpm(packageName: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data['dist-tags']?.latest || data.version || null;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch package version from PyPI registry
 */
async function fetchPackageVersionFromPyPI(packageName: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.info?.version || null;
  } catch (error) {
    return null;
  }
}

/**
 * Determine if package should use PyPI or npm registry
 */
function isPythonPackageManager(command: string, args: string[] = []): boolean {
  const fullCommand = [command, ...args].join(' ');
  return fullCommand.includes('pipx') || fullCommand.includes('uvx');
}

/**
 * Get package version for STDIO MCP servers that use npx/bunx/uvx/pipx
 *
 * This function works by:
 * 1. Parsing the command string to extract package names and versions
 * 2. If version is already specified in command (e.g. package@1.2.3), use it directly
 * 3. If no version specified, query the appropriate package registry:
 *    - npm registry for JavaScript packages (npx/bunx)
 *    - PyPI registry for Python packages (pipx/uvx)
 *
 * Note: This does NOT require the actual package manager tools (npx/bunx/pipx/uvx)
 * to be installed. It only parses command strings and makes HTTP requests to
 * public package registries. If network requests fail, it gracefully returns "unknown".
 */
async function getPackageVersion(server: MCPServerConfig): Promise<string> {
  if (server.type !== MCPServerType.STDIO || !server.command) {
    return "unknown";
  }

  const packageInfo = parsePackageFromCommand(server.command, server.args);
  if (!packageInfo) {
    return "unknown";
  }

  // If we already have a version from the command, use it
  if (packageInfo.version && packageInfo.version !== 'latest') {
    return packageInfo.version;
  }

  // Determine which registry to use based on package manager
  const usePyPI = isPythonPackageManager(server.command, server.args);
  const latestVersion = usePyPI
    ? await fetchPackageVersionFromPyPI(packageInfo.name)
    : await fetchPackageVersionFromNpm(packageInfo.name);

  return latestVersion || "unknown";
}


export class MCPVerifier {
  private defaultTimeout: number;

  constructor(defaultTimeout: number = DEFAULT_CONNECTION_TIMEOUT_MS) {
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Color utility function for token display
   */
  private colorizeTokenCount(tokenCount: number): string {
    if (tokenCount <= TOKEN_COUNT_THRESHOLDS.LOW) return green(tokenCount.toString());
    if (tokenCount <= TOKEN_COUNT_THRESHOLDS.MEDIUM) return yellow(tokenCount.toString());
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
    const abortController = new AbortController();
    let client: Client | null = null;
    let transport: any = null;

    try {
      // Create the appropriate transport based on server type
      transport = await this.createTransport(server);
      
      // Create the MCP client
      client = new Client({
        name: MCP_VERIFIER_CONFIG.name,
        version: MCP_VERIFIER_CONFIG.version
      });

      // Set up timeout promise that properly cancels resources
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(async () => {
          abortController.abort();
          // Cleanup resources on timeout
          try {
            if (client) {
              await client.close();
            }
            if (transport && typeof transport.close === 'function') {
              await transport.close();
            }
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
          reject(new TimeoutError(`Connection timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        
        // Clear timeout if operation completes before timeout
        abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
        });
      });

      // Connect to the server with timeout
      const connectPromise = this.connectAndVerify(client, transport, server, abortController.signal);
      
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
      const isTimeout = error instanceof TimeoutError || connectionTime >= timeoutMs;
      
      return {
        server,
        status: isTimeout ? 'timeout' : 'error',
        error: errorMessage,
        connectionTime
      };
    } finally {
      // Ensure cleanup happens in all cases
      abortController.abort();
      try {
        if (client) {
          await client.close();
        }
        if (transport && typeof transport.close === 'function') {
          await transport.close();
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
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
      case MCPServerType.STDIO: {
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
      }

      case MCPServerType.HTTP:
        if (!server.url) {
          throw new MCPVerificationError('HTTP server missing URL', server.name);
        }
        return new StreamableHTTPClientTransport(new URL(server.url));

      case MCPServerType.SSE:
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
    server: MCPServerConfig,
    abortSignal?: AbortSignal
  ): Promise<MCPCapabilities> {
    try {
      // Check if operation was aborted before starting
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }
      
      // Connect to the server
      await client.connect(transport);

      // Get server info and fetch package version
      const packageVersion = await getPackageVersion(server);
      const serverInfo = {
        name: server.name,
        version: packageVersion,
        protocolVersion: "unknown"
      };

      // Check for abort before continuing
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }

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

      // Check for abort before continuing
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
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

      // Check for abort before continuing
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
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
          // Sanitize URL to remove credentials and sensitive query parameters
          let sanitizedUrl: string;
          try {
            const parsedUrl = new URL(server.url);
            parsedUrl.username = '';
            parsedUrl.password = '';
            parsedUrl.search = ''; // Remove query parameters
            sanitizedUrl = parsedUrl.toString();
          } catch (error) {
            // Fallback to just host+pathname if URL parsing fails
            sanitizedUrl = server.url.split('?')[0] || 'invalid-url';
          }
          output.push(`   URL: ${sanitizedUrl}`);
        }
      }
      
      output.push(''); // Empty line between servers
    }

    return output.join('\n');
  }
}