import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { countTokens } from 'contextcalc';
import { green, yellow, red } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { extractPackageFromCommand, fetchLatestVersion } from '../utils/packageVersion.js';
import { MCPServerType } from '../types/index.js';
import { DEFAULT_CONNECTION_TIMEOUT_MS, MAX_RESOURCE_CONTENT_SIZE, MCP_VERIFIER_CONFIG, TimeoutError, TOKEN_COUNT_THRESHOLDS } from '../constants/index.js';
import type {
  MCPServerConfig,
  MCPVerificationResult,
  MCPCapabilities,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPVerificationOptions,
  JSONSchema,
  JSONSchemaProperty
} from '../types/index.js';

export class MCPVerificationError extends Error {
  constructor(message: string, public readonly serverName: string) {
    super(message);
    this.name = 'MCPVerificationError';
  }
}


export class MCPVerifier {
  private defaultTimeout: number;

  /**
   * Creates a new MCP server verifier instance
   *
   * @param defaultTimeout - Default connection timeout in milliseconds (default: 30000)
   *
   * @example
   * ```typescript
   * const verifier = new MCPVerifier();
   * // or with custom timeout
   * const verifier = new MCPVerifier(15000);
   * ```
   */
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
   * Check if tool has valid input schema with properties
   */
  private hasValidInputSchema(tool: MCPTool): boolean {
    return tool.inputSchema !== undefined
      && typeof tool.inputSchema === 'object'
      && Object.keys(tool.inputSchema.properties || {}).length > 0;
  }

  /**
   * Format type information from schema property
   */
  private formatType(schema: JSONSchemaProperty): string {
    const type = schema.type || 'any';
    return Array.isArray(type) ? type.join(' | ') : type;
  }

  /**
   * Format number range constraints
   */
  private formatNumberRange(schema: JSONSchemaProperty): string {
    const min = schema.minimum !== undefined ? schema.minimum : '-∞';
    const max = schema.maximum !== undefined ? schema.maximum : '∞';
    return `(${min}-${max})`;
  }

  /**
   * Format string length constraints
   */
  private formatStringLength(schema: JSONSchemaProperty): string {
    const minLen = schema.minLength !== undefined ? schema.minLength : 0;
    const maxLen = schema.maxLength !== undefined ? schema.maxLength : '∞';
    return `length: ${minLen}-${maxLen}`;
  }

  /**
   * Format array item constraints
   */
  private formatArrayConstraints(schema: JSONSchemaProperty): string[] {
    const constraints: string[] = [];

    if (schema.items) {
      const itemType = schema.items.type;
      const itemTypeStr = itemType
        ? (Array.isArray(itemType) ? itemType.join(' | ') : itemType)
        : 'any';
      constraints.push(`items: ${itemTypeStr}`);

      if (schema.minItems !== undefined || schema.maxItems !== undefined) {
        const minItems = schema.minItems !== undefined ? schema.minItems : 0;
        const maxItems = schema.maxItems !== undefined ? schema.maxItems : '∞';
        constraints.push(`(${minItems}-${maxItems} items)`);
      }
    }

    return constraints;
  }

  /**
   * Collect all constraints for a parameter
   */
  private formatConstraints(schema: JSONSchemaProperty, typeInfo: string): string[] {
    const constraints: string[] = [];

    // Enum values
    if (schema.enum && Array.isArray(schema.enum)) {
      constraints.push(`[${schema.enum.join(', ')}]`);
    }

    // Min/Max for numbers
    if (schema.minimum !== undefined || schema.maximum !== undefined) {
      constraints.push(this.formatNumberRange(schema));
    }

    // Default value
    if (schema.default !== undefined) {
      constraints.push(`default: ${JSON.stringify(schema.default)}`);
    }

    // Min/Max length for strings
    if (schema.minLength !== undefined || schema.maxLength !== undefined) {
      constraints.push(this.formatStringLength(schema));
    }

    // Pattern for strings
    if (schema.pattern) {
      constraints.push(`pattern: ${schema.pattern}`);
    }

    // Array items - handle both single type and union types
    const isArray = Array.isArray(schema.type)
      ? schema.type.includes('array')
      : schema.type === 'array';
    if (isArray) {
      constraints.push(...this.formatArrayConstraints(schema));
    }

    return constraints;
  }

  /**
   * Format a single parameter for display
   */
  private formatParameter(name: string, schema: JSONSchemaProperty, isRequired: boolean): string {
    const parts: string[] = [];
    const typeInfo = this.formatType(schema);

    // Parameter name with required/optional label
    parts.push(`${name} (${isRequired ? 'required' : 'optional'})`);
    parts.push(typeInfo);

    // Add description if available
    if (schema.description) {
      parts.push(schema.description);
    }

    // Add constraints
    const constraints = this.formatConstraints(schema, typeInfo);
    if (constraints.length > 0) {
      parts.push(constraints.join(', '));
    }

    return `      • ${parts.join(' - ')}`;
  }

  /**
   * Format tool parameters from inputSchema for display
   */
  private formatToolParameters(tool: MCPTool): string[] {
    if (!this.hasValidInputSchema(tool)) {
      return [];
    }

    const schema: JSONSchema = tool.inputSchema!;
    const properties = schema.properties || {};
    const required = schema.required || [];

    return Object.entries(properties).map(([name, prop]) =>
      this.formatParameter(name, prop, required.includes(name))
    );
  }

  /**
   * Calculate token counts for MCP tools based on how they appear in Claude's context
   */
  private calculateToolTokens(tools: MCPTool[], serverName: string): { toolTokenCounts: Map<string, number>; totalToolTokens: number } {
    const toolTokenCounts = new Map<string, number>();
    let totalToolTokens = 0;

    for (const tool of tools) {
      try {
        // Create a complete tool representation as it would appear in Claude's context
        // This matches the JSON schema format that Claude receives for function calling
        const rawSchema: JSONSchema | undefined =
          tool.inputSchema && typeof tool.inputSchema === "object"
            ? tool.inputSchema
            : undefined;
        const schemaType = rawSchema?.type;
        const parameters = {
          $schema: "http://json-schema.org/draft-07/schema#",
          ...(rawSchema ?? {}),
        };

        const hasObjectHints =
          rawSchema !== undefined &&
          ["properties", "required", "additionalProperties", "patternProperties"].some(
            (key) => key in rawSchema
          );

        const isObjectSchema =
          rawSchema === undefined ||
          schemaType === "object" ||
          (Array.isArray(schemaType) && schemaType.includes("object")) ||
          hasObjectHints;

        // Only apply object-specific defaults when the schema is actually an object type
        if (isObjectSchema) {
          if (!("type" in parameters)) parameters.type = "object";
          if (!("properties" in parameters)) parameters.properties = {};
          if (!("required" in parameters)) parameters.required = [];
          if (!("additionalProperties" in parameters))
            parameters.additionalProperties = false;
        }

        // Create the prefixed tool name as it appears in Claude's context
        const prefixedToolName = `mcp__${serverName}__${tool.name}`;

        const toolForCounting = {
          name: prefixedToolName,
          ...(tool.description !== undefined ? { description: tool.description } : {}),
          parameters,
        };

        // Create the function wrapper format that Claude actually receives
        // This includes the full function definition with formatted JSON schema
        const functionDefinition = JSON.stringify(toolForCounting);
        const claudeToolRepresentation = `<function>${functionDefinition}</function>`;

        // Count tokens for the complete tool representation including wrapper
        //
        // Token Counting Methodology:
        // We use a 9x multiplier based on empirical testing against Claude Code v2.x /context command.
        // Base calculation counts JSON schema representation, but Claude Code adds significant overhead:
        // - System instructions for MCP tool usage patterns
        // - Additional formatting and metadata per tool
        // - Function calling protocol overhead
        //
        // Example (everything MCP server):
        //   Our base count: ~340 tokens (echo tool)
        //   Claude Code actual: 596 tokens (echo tool)
        //   Ratio: 596/340 = 1.75x
        //   Applied multiplier: 5x * 1.75 = 8.75x ≈ 9x
        //
        // This multiplier was validated against @modelcontextprotocol/server-everything v0.6.2
        // on Claude Code v2.x in October 2025.
        const tokenCount = countTokens(claudeToolRepresentation) * 9;

        toolTokenCounts.set(tool.name, tokenCount);
        totalToolTokens += tokenCount;
      } catch (error) {
        // If token counting fails for a specific tool, default to 0
        logger.error(`Failed to count tokens for tool ${tool.name}: ${error instanceof Error ? error.message : String(error)}`);
        toolTokenCounts.set(tool.name, 0);
      }
    }

    return { toolTokenCounts, totalToolTokens };
  }

  /**
   * Verifies a single MCP server and retrieves its capabilities
   *
   * @param server - MCP server configuration
   * @param options - Verification options
   * @param options.timeout - Connection timeout in milliseconds (overrides default)
   * @param options.includeResourceContents - Fetch actual resource data (may be slow for large resources)
   * @param options.includePromptDetails - Fetch prompt templates with full message content
   * @param options.includeTokenCounts - Calculate token usage for tools (default: true)
   * @returns Verification result with server capabilities, connection time, and status
   *
   * @example
   * ```typescript
   * const verifier = new MCPVerifier();
   * const result = await verifier.verifyServer(
   *   {
   *     name: 'filesystem',
   *     type: MCPServerType.STDIO,
   *     command: 'npx',
   *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace']
   *   },
   *   {
   *     timeout: 10000,
   *     includeResourceContents: true,
   *     includePromptDetails: true
   *   }
   * );
   *
   * if (result.status === 'success') {
   *   console.log(`Tools: ${result.capabilities.tools.length}`);
   *   console.log(`Total tokens: ${result.capabilities.totalToolTokens}`);
   * }
   * ```
   */
  async verifyServer(server: MCPServerConfig, options?: MCPVerificationOptions): Promise<MCPVerificationResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeout || this.defaultTimeout;
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
      const connectPromise = this.connectAndVerify(client, transport, server, abortController.signal, options);

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
   * Verifies multiple MCP servers in parallel
   *
   * @param servers - Array of MCP server configurations to verify
   * @param options - Verification options (applied to all servers)
   * @returns Array of verification results for each server
   *
   * @example
   * ```typescript
   * const verifier = new MCPVerifier();
   * const servers = [
   *   {
   *     name: 'filesystem',
   *     type: MCPServerType.STDIO,
   *     command: 'npx',
   *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace']
   *   },
   *   {
   *     name: 'github',
   *     type: MCPServerType.HTTP,
   *     url: 'https://api.githubcopilot.com/mcp/',
   *     headers: { Authorization: 'Bearer YOUR_TOKEN' }
   *   }
   * ];
   *
   * const results = await verifier.verifyServers(servers, { timeout: 15000 });
   * const successCount = results.filter(r => r.status === 'success').length;
   * console.log(`${successCount}/${results.length} servers verified successfully`);
   * ```
   */
  async verifyServers(servers: MCPServerConfig[], options?: MCPVerificationOptions): Promise<MCPVerificationResult[]> {
    const results = await Promise.allSettled(
      servers.map(server => this.verifyServer(server, options))
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
    abortSignal?: AbortSignal,
    options?: MCPVerificationOptions
  ): Promise<MCPCapabilities> {
    try {
      // Check if operation was aborted before starting
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }
      
      // Connect to the server
      await client.connect(transport);

      // Extract server version from MCP protocol
      const serverVersion = client.getServerVersion();
      logger.debug(`[Version Detection] MCP protocol returned: ${JSON.stringify(serverVersion)}`);

      // Get server info from MCP protocol or fallback to defaults
      const serverInfo = {
        name: serverVersion?.name || server.name,
        version: serverVersion?.version || "unknown",
        protocolVersion: "unknown"
      };

      // If version is still unknown and this is a STDIO server, try npm registry fallback
      if (serverInfo.version === "unknown" && server.type === MCPServerType.STDIO) {
        logger.debug(`[Version Detection] Version unknown, attempting npm registry fallback for STDIO server`);

        const packageSpec = extractPackageFromCommand(server.command, server.args);
        if (packageSpec) {
          logger.debug(`[Version Detection] Extracted package: ${packageSpec}`);

          try {
            const registryVersion = await fetchLatestVersion(packageSpec, { timeout: 3000 });
            if (registryVersion) {
              serverInfo.version = registryVersion;
              logger.debug(`[Version Detection] npm registry returned: ${registryVersion}`);
            } else {
              logger.debug(`[Version Detection] npm registry returned no version for: ${packageSpec}`);
            }
          } catch (error) {
            logger.debug(`[Version Detection] npm registry lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          logger.debug(`[Version Detection] Could not extract package name from command: ${server.command} ${server.args?.join(' ')}`);
        }
      }

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
          // Cast to any since MCP SDK type doesn't exactly match our JSONSchema interface
          if (tool.inputSchema !== undefined) mcpTool.inputSchema = tool.inputSchema as any;
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

        // Fetch all resources in parallel for better performance
        const resourcePromises = resourcesResponse.resources.map(async (resource) => {
          const mcpResource: MCPResource = { uri: resource.uri };
          if (resource.name !== undefined) mcpResource.name = resource.name;
          if (resource.description !== undefined) mcpResource.description = resource.description;
          if (resource.mimeType !== undefined) mcpResource.mimeType = resource.mimeType;

          // Optionally fetch resource contents
          if (options?.includeResourceContents) {
            try {
              const resourceData = await client.readResource({ uri: resource.uri });
              if (resourceData.contents && resourceData.contents.length > 0) {
                const content = resourceData.contents[0];
                if (content && 'text' in content && typeof content.text === 'string') {
                  // Check size limit for text content
                  const contentSize = Buffer.byteLength(content.text, 'utf8');
                  if (contentSize > MAX_RESOURCE_CONTENT_SIZE) {
                    logger.debug(`Resource content too large for ${resource.uri}: ${contentSize} bytes (max: ${MAX_RESOURCE_CONTENT_SIZE})`);
                  } else {
                    mcpResource.contents = content.text;
                  }
                } else if (content && 'blob' in content && typeof content.blob === 'string') {
                  // Check size limit for blob content
                  const blobBuffer = Buffer.from(content.blob, 'base64');
                  if (blobBuffer.length > MAX_RESOURCE_CONTENT_SIZE) {
                    logger.debug(`Resource content too large for ${resource.uri}: ${blobBuffer.length} bytes (max: ${MAX_RESOURCE_CONTENT_SIZE})`);
                  } else {
                    mcpResource.contents = new Uint8Array(blobBuffer);
                  }
                }
              }
            } catch (resourceError) {
              // Failed to fetch resource content, continue without it
              logger.debug(`Failed to fetch resource content for ${resource.uri}: ${resourceError instanceof Error ? resourceError.message : 'Unknown error'}`);
            }
          }

          return mcpResource;
        });

        resources.push(...await Promise.all(resourcePromises));
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

        // Fetch all prompts in parallel for better performance
        const promptPromises = promptsResponse.prompts.map(async (prompt) => {
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

          // Optionally fetch prompt template
          if (options?.includePromptDetails) {
            try {
              // Get prompt with empty arguments to see the template structure
              const promptData = await client.getPrompt({ name: prompt.name, arguments: {} });
              if (promptData.messages && promptData.messages.length > 0) {
                // Combine all message contents into the template
                mcpPrompt.template = promptData.messages
                  .map(msg => {
                    if (typeof msg.content === 'string') return msg.content;
                    if (typeof msg.content === 'object' && 'text' in msg.content) return msg.content.text;
                    return JSON.stringify(msg.content);
                  })
                  .join('\n\n');
              }
            } catch (promptError) {
              // Failed to fetch prompt details, continue without it
              logger.debug(`Failed to fetch prompt template for ${prompt.name}: ${promptError instanceof Error ? promptError.message : 'Unknown error'}`);
            }
          }

          return mcpPrompt;
        });

        prompts.push(...await Promise.all(promptPromises));
      } catch (error) {
        // Prompts might not be supported, continue
      }

      // Calculate token counts for tools (unless disabled)
      const shouldIncludeTokenCounts = options?.includeTokenCounts !== false;
      const tokenData = shouldIncludeTokenCounts
        ? this.calculateToolTokens(tools, server.name)
        : undefined;

      const capabilities: MCPCapabilities = {
        tools,
        resources,
        prompts,
        serverInfo
      };

      // Only include token fields when they're calculated
      if (tokenData) {
        capabilities.toolTokenCounts = tokenData.toolTokenCounts;
        capabilities.totalToolTokens = tokenData.totalToolTokens;
      }

      return capabilities;

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
   * Formats verification results for console display with color-coded output
   *
   * @param results - Array of verification results to format
   * @returns Formatted string with tools, resources, prompts, and connection status
   *
   * @remarks
   * - Token counts are color-coded: green (≤5k), yellow (5k-15k), red (>15k)
   * - Resources and prompts are shown when DEBUG=1 or when content/templates are fetched
   * - Failed servers display connection details for debugging
   *
   * @example
   * ```typescript
   * const verifier = new MCPVerifier();
   * const results = await verifier.verifyServers(servers);
   * const formatted = verifier.formatResults(results);
   * console.log(formatted);
   * ```
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

            // Display parameters if available
            const parameters = this.formatToolParameters(tool);
            if (parameters.length > 0) {
              parameters.forEach(param => output.push(param));
            }
          });
        }
        
        // Show resources (in debug mode or if contents were fetched)
        if (capabilities.resources.length > 0) {
          const hasContents = capabilities.resources.some(r => r.contents !== undefined);
          if (isDebugMode || hasContents) {
            output.push(`   \n   Resources (${capabilities.resources.length}):`);
            capabilities.resources.forEach(resource => {
              const resourceName = resource.name || resource.uri.split('/').pop() || resource.uri;
              output.push(`   • ${resourceName}${resource.description ? ` - ${resource.description}` : ''}`);

              // Show content preview if fetched
              if (resource.contents) {
                const contentStr = typeof resource.contents === 'string'
                  ? resource.contents
                  : `<binary data: ${resource.contents.length} bytes>`;
                const preview = contentStr.length > 100
                  ? contentStr.slice(0, 100) + '...'
                  : contentStr;
                output.push(`     Content: ${preview}`);
              }
            });
          }
        }

        // Show prompts (in debug mode or if templates were fetched)
        if (capabilities.prompts.length > 0) {
          const hasTemplates = capabilities.prompts.some(p => p.template !== undefined);
          if (isDebugMode || hasTemplates) {
            output.push(`   \n   Prompts (${capabilities.prompts.length}):`);
            capabilities.prompts.forEach(prompt => {
              output.push(`   • ${prompt.name}${prompt.description ? ` - ${prompt.description}` : ''}`);

              // Show template preview if fetched
              if (prompt.template) {
                const preview = prompt.template.length > 100
                  ? prompt.template.slice(0, 100) + '...'
                  : prompt.template;
                output.push(`     Template: ${preview}`);
              }

              // Show arguments if present
              if (prompt.arguments && prompt.arguments.length > 0) {
                output.push(`     Arguments: ${prompt.arguments.map(a => `${a.name}${a.required ? '*' : ''}`).join(', ')}`);
              }
            });
          }
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