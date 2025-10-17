# MCP Verifier Library API

The MCP Verifier library provides programmatic access to verify Model Context Protocol (MCP) servers, check their capabilities, and retrieve detailed information about tools, resources, and prompts.

## Installation

```bash
npm install agentinit
```

## Quick Start

```typescript
import { MCPVerifier } from 'agentinit/verifier';
import { MCPServerType } from 'agentinit/types';

const verifier = new MCPVerifier();

const result = await verifier.verifyServer({
  name: 'everything',
  type: MCPServerType.STDIO,
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-everything']
});

if (result.status === 'success') {
  console.log(`✅ Server verified: ${result.server.name}`);
  console.log(`Tools: ${result.capabilities.tools.length}`);
  console.log(`Total tokens: ${result.capabilities.totalToolTokens}`);
}
```

## API Reference

### `MCPVerifier`

The main class for verifying MCP servers.

#### Constructor

```typescript
new MCPVerifier(defaultTimeout?: number)
```

- **defaultTimeout** (optional): Default connection timeout in milliseconds. Default: 10000 (10 seconds)

#### Methods

##### `verifyServer(server, options?)`

Verify a single MCP server and retrieve its capabilities.

```typescript
async verifyServer(
  server: MCPServerConfig,
  options?: MCPVerificationOptions
): Promise<MCPVerificationResult>
```

**Parameters:**
- **server**: MCP server configuration
  - `name`: Server name
  - `type`: Server type (`MCPServerType.STDIO`, `MCPServerType.HTTP`, or `MCPServerType.SSE`)
  - `command`: Command to execute (for STDIO servers)
  - `args`: Command arguments (for STDIO servers)
  - `url`: Server URL (for HTTP/SSE servers)
  - `env`: Environment variables (optional)
  - `headers`: HTTP headers (optional, for HTTP/SSE servers)

- **options** (optional): Verification options
  - `timeout`: Connection timeout in milliseconds
  - `includeResourceContents`: Fetch actual resource data (default: false)
  - `includePromptDetails`: Fetch prompt templates (default: false)
  - `includeTokenCounts`: Calculate token usage (default: true)
  - `maxConcurrentFetches`: Max concurrent resource/prompt fetches (default: 5)

**Returns:** `MCPVerificationResult` containing:
- `server`: The server configuration
- `status`: `'success'`, `'error'`, or `'timeout'`
- `capabilities`: Server capabilities (if successful)
  - `tools`: Array of available tools with parameters
  - `resources`: Array of available resources
  - `prompts`: Array of available prompts
  - `serverInfo`: Server metadata
  - `toolTokenCounts`: Token count per tool
  - `totalToolTokens`: Total token usage for all tools
- `error`: Error message (if failed)
- `connectionTime`: Time taken to connect (in milliseconds)

##### `verifyServers(servers, options?)`

Verify multiple MCP servers in parallel.

```typescript
async verifyServers(
  servers: MCPServerConfig[],
  options?: MCPVerificationOptions
): Promise<MCPVerificationResult[]>
```

**Parameters:** Same as `verifyServer`, but accepts an array of server configurations.

**Returns:** Array of `MCPVerificationResult` objects.

##### `formatResults(results)`

Format verification results for console display.

```typescript
formatResults(results: MCPVerificationResult[]): string
```

**Parameters:**
- **results**: Array of verification results

**Returns:** Formatted string ready for console output.

## Examples

### Basic Verification

```typescript
import { MCPVerifier } from 'agentinit/verifier';
import { MCPServerType } from 'agentinit/types';

const verifier = new MCPVerifier();

const result = await verifier.verifyServer({
  name: 'filesystem',
  type: MCPServerType.STDIO,
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/username/Documents']
});

console.log(verifier.formatResults([result]));
```

### Verify Multiple Servers

```typescript
const servers = [
  {
    name: 'filesystem',
    type: MCPServerType.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace']
  },
  {
    name: 'github',
    type: MCPServerType.HTTP,
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { Authorization: 'Bearer YOUR_TOKEN' }
  }
];

const results = await verifier.verifyServers(servers);

const successCount = results.filter(r => r.status === 'success').length;
console.log(`${successCount}/${results.length} servers verified successfully`);
```

### Fetch Resource Contents and Prompt Templates

```typescript
const result = await verifier.verifyServer(
  {
    name: 'everything',
    type: MCPServerType.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything']
  },
  {
    includeResourceContents: true,
    includePromptDetails: true,
    timeout: 15000
  }
);

if (result.status === 'success' && result.capabilities) {
  // Access resource contents
  result.capabilities.resources.forEach(resource => {
    if (resource.contents) {
      console.log(`Resource ${resource.name}: ${resource.contents}`);
    }
  });

  // Access prompt templates
  result.capabilities.prompts.forEach(prompt => {
    if (prompt.template) {
      console.log(`Prompt ${prompt.name}: ${prompt.template}`);
    }
  });
}
```

### Inspect Tool Parameters

```typescript
const result = await verifier.verifyServer(serverConfig);

if (result.status === 'success' && result.capabilities) {
  result.capabilities.tools.forEach(tool => {
    console.log(`\nTool: ${tool.name}`);
    console.log(`Description: ${tool.description}`);

    // Parse input schema to show parameters
    if (tool.inputSchema && tool.inputSchema.properties) {
      const { properties, required = [] } = tool.inputSchema;

      console.log('Parameters:');
      Object.entries(properties).forEach(([name, schema]: [string, any]) => {
        const isRequired = required.includes(name);
        console.log(`  - ${name} (${schema.type}${isRequired ? ', required' : ''}): ${schema.description || 'N/A'}`);
      });
    }

    // Check token usage
    const tokenCount = result.capabilities.toolTokenCounts?.get(tool.name);
    if (tokenCount) {
      console.log(`Token usage: ${tokenCount} tokens`);
    }
  });
}
```

### Custom Timeout and Error Handling

```typescript
const verifier = new MCPVerifier(5000); // 5 second default timeout

try {
  const result = await verifier.verifyServer(
    serverConfig,
    { timeout: 20000 } // Override with 20 second timeout
  );

  switch (result.status) {
    case 'success':
      console.log('✅ Verification successful');
      break;
    case 'timeout':
      console.error('⏱️ Connection timeout');
      break;
    case 'error':
      console.error(`❌ Error: ${result.error}`);
      break;
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

### Skip Token Counting for Performance

If you only need to verify connectivity and list capabilities without token calculation:

```typescript
const result = await verifier.verifyServer(
  serverConfig,
  { includeTokenCounts: false }
);

// Token counts will be undefined
console.log(result.capabilities?.toolTokenCounts); // undefined
console.log(result.capabilities?.totalToolTokens); // undefined
```

### Tune Concurrency for Server Performance

Control how many resources/prompts are fetched in parallel. Use higher values for fast servers, lower for slow or rate-limited servers:

```typescript
// Fast server - increase concurrency
const result = await verifier.verifyServer(serverConfig, {
  includeResourceContents: true,
  maxConcurrentFetches: 10
});

// Slow or rate-limited server - decrease concurrency
const result2 = await verifier.verifyServer(slowServer, {
  includeResourceContents: true,
  maxConcurrentFetches: 2
});
```

## Version Detection

The verifier automatically detects MCP server versions using a multi-layered approach:

### 1. MCP Protocol Version (Primary)

The verifier first attempts to extract the server version from the MCP protocol's initialization handshake:

```typescript
const result = await verifier.verifyServer(serverConfig);

if (result.status === 'success' && result.capabilities) {
  console.log(`Server: ${result.capabilities.serverInfo?.name}`);
  console.log(`Version: ${result.capabilities.serverInfo?.version}`);
}
```

Most properly implemented MCP servers report their version through the protocol.

### 2. NPM Registry Fallback (STDIO servers only)

For STDIO servers that don't report their version through the protocol, the verifier automatically falls back to querying the npm registry:

```typescript
// This will query npm registry if MCP protocol doesn't provide version
const result = await verifier.verifyServer({
  name: 'chrome-devtools',
  type: MCPServerType.STDIO,
  command: 'npx',
  args: ['-y', 'chrome-devtools-mcp@latest']
});

// Version will be extracted from npm registry (e.g., "0.7.0")
console.log(result.capabilities?.serverInfo?.version);
```

**Supported package formats:**
- `chrome-devtools-mcp@latest` → queries npm for latest version
- `chrome-devtools-mcp@0.7.0` → extracts explicit version "0.7.0"
- `@org/package@latest` → handles scoped packages
- `package` → queries npm for latest version

**Version extraction from command:**
```typescript
import { extractPackageFromCommand, fetchLatestVersion } from 'agentinit/utils';

// Extract package name from command arguments
const packageName = extractPackageFromCommand('npx', ['-y', 'chrome-devtools-mcp@latest']);
// Returns: "chrome-devtools-mcp@latest"

// Fetch version from npm registry
const version = await fetchLatestVersion('chrome-devtools-mcp');
// Returns: "0.7.0"
```

### 3. Version Cache

The npm registry fallback includes an in-memory cache with a 5-minute TTL to minimize API calls:

```typescript
import { getVersionCacheStats, clearVersionCache } from 'agentinit/utils';

// Check cache statistics
const stats = getVersionCacheStats();
console.log(`Cache size: ${stats.size} entries`);
stats.entries.forEach(entry => {
  console.log(`${entry.package}@${entry.version} (cached ${entry.age}ms ago)`);
});

// Clear cache if needed
clearVersionCache();
```

### Debug Logging

Enable debug logging to see the version detection flow:

```bash
DEBUG=1 agentinit verify_mcp --all
```

Debug output includes:
- MCP protocol version response
- Package extraction from command
- npm registry queries and results
- Fallback activation

## Token Counting Methodology

The verifier calculates token usage for MCP tools based on empirical testing against Claude Code v2.x. The calculation includes:

- Tool name (with MCP prefix: `mcp__<server>__<tool>`)
- Tool description
- Complete JSON Schema for parameters
- Function calling wrapper format

**Note:** The token counts use a 9x multiplier based on validation against Claude Code's `/context` command output. This accounts for:
- System instructions for MCP tool usage
- Additional formatting and metadata per tool
- Function calling protocol overhead

Token counts were validated against:
- `@modelcontextprotocol/server-everything` v0.6.2
- Claude Code v2.x
- October 2025

## Type Definitions

### `MCPServerType`

```typescript
enum MCPServerType {
  STDIO = 'stdio',
  HTTP = 'http',
  SSE = 'sse'
}
```

### `MCPServerConfig`

```typescript
interface MCPServerConfig {
  name: string;
  type: MCPServerType;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}
```

### `MCPVerificationOptions`

```typescript
interface MCPVerificationOptions {
  timeout?: number;
  includeResourceContents?: boolean;
  includePromptDetails?: boolean;
  includeTokenCounts?: boolean;
  maxConcurrentFetches?: number;
}
```

### `MCPTool`

```typescript
interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any; // JSON Schema object
}
```

### `MCPResource`

```typescript
interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  contents?: string | Uint8Array; // Only present if includeResourceContents is true
}
```

### `MCPPrompt`

```typescript
interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  template?: string; // Only present if includePromptDetails is true
}
```

## Performance Considerations

- **Resource Contents**: Fetching resource contents can be slow for large resources or many resources. Only enable `includeResourceContents` when you need the actual data.

- **Prompt Templates**: Fetching prompt templates requires additional round trips to the MCP server. Only enable `includePromptDetails` when needed.

- **Token Counting**: Token counting adds minimal overhead and is enabled by default. Disable with `includeTokenCounts: false` if you don't need it.

- **Concurrency Tuning**: Adjust `maxConcurrentFetches` (default: 5) based on server performance. Use higher values (10-20) for fast servers, lower (1-3) for slow or rate-limited servers.

- **Parallel Verification**: Use `verifyServers()` to verify multiple servers in parallel for better performance.

## Error Handling

The library does not throw exceptions for server verification failures. Instead, check the `status` field:

```typescript
const result = await verifier.verifyServer(config);

if (result.status === 'success') {
  // Server verified successfully
  console.log(result.capabilities);
} else if (result.status === 'timeout') {
  // Connection timeout
  console.error('Server took too long to respond');
} else {
  // Verification error
  console.error('Verification failed:', result.error);
}
```

## License

MIT
