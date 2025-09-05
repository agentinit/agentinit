# How to Add a New Agent to AgentInit

This guide explains how to add support for a new AI coding agent to the AgentInit CLI tool. AgentInit uses a plugin-based architecture that makes it easy to add support for new agents while maintaining consistency and reliability.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Guide](#step-by-step-guide)
4. [Code Examples](#code-examples)
5. [Real-World Example: CursorAgent](#real-world-example-cursoragent)
6. [Testing Guidelines](#testing-guidelines)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

## Overview

The AgentInit architecture consists of several key components:

- **Agent Base Class**: Abstract class defining the common interface (`src/agents/Agent.ts`)
- **Agent Implementations**: Concrete classes for specific agents (e.g., `ClaudeAgent`, `CursorAgent`)
- **Agent Manager**: Handles registration and detection (`src/core/agentManager.ts`)
- **MCP Filter**: Filters and transforms MCP servers for agent compatibility (`src/core/mcpFilter.ts`)
- **Configuration Merger**: Handles merging of configuration files (`src/core/configMerger.ts`)

Each agent implementation:
1. Defines its capabilities and configuration requirements
2. Detects its presence in projects
3. Converts universal MCP configuration to its native format
4. Optionally filters or transforms MCP servers for compatibility

## Prerequisites

Before adding a new agent, you should:

1. **Research the target agent's MCP configuration format**:
   - What file(s) does it use for MCP configuration?
   - What's the exact JSON/TOML structure?
   - Does it support stdio, HTTP, and/or SSE MCP servers?
   - Where should the configuration file be placed?

2. **Understand the agent's capabilities**:
   - Does it support rules files?
   - Does it have hooks or commands?
   - Does it support subagents?
   - Any unique features?

3. **Have the development environment set up**:
   - Node.js and npm installed
   - TypeScript knowledge
   - Jest for testing
   - Access to the target agent for testing

## Step-by-Step Guide

### 1. Research the Target Agent

First, thoroughly research how the agent handles MCP configuration:

```bash
# Example research for a hypothetical "SuperCoder" agent
# - Check documentation at https://supercoder.dev/docs/mcp
# - Look for configuration examples
# - Test with actual MCP servers
# - Identify configuration file locations
```

**Key questions to answer:**
- What file does it use? (e.g., `.supercoder/config.json`, `supercoder.toml`)
- What's the structure? (JSON, TOML, YAML)
- Does it support all MCP transport types?
- Are there any special requirements or limitations?

### 2. Create the Agent Class

Create a new file `src/agents/YourAgent.ts`:

```typescript
import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition } from '../types/index.js';

/**
 * YourAgent implementation
 * Brief description of capabilities and config format
 */
export class YourAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'your-agent',           // Unique identifier
      name: 'Your Agent Name',     // Human-readable name
      url: 'https://docs.example.com/mcp',  // Documentation URL (optional)
      capabilities: {
        mcp: {
          stdio: true,   // Does it support stdio MCP servers?
          http: true,    // Does it support HTTP MCP servers?  
          sse: false     // Does it support SSE MCP servers?
        },
        rules: true,      // Does it support .rules files?
        hooks: false,     // Does it support hooks?
        commands: true,   // Does it support custom commands?
        subagents: false, // Does it support subagents?
        statusline: true  // Does it support statusline customization?
      },
      configFiles: [
        '.youragent',           // Files that indicate presence
        '.youragent/config.json'
      ],
      nativeConfigPath: '.youragent/mcp.json'  // Where to write MCP config
    };

    super(definition);
  }

  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    // Implementation details in next section
  }

  // Override if needed for custom filtering
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return super.filterMCPServers(servers);
  }

  // Override if needed for transformations
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // or apply transformations
  }
}
```

### 3. Implement the `applyMCPConfig` Method

This is the core method that converts universal MCP configuration to your agent's native format:

```typescript
async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
  const configPath = this.getNativeMcpPath(projectPath);
  
  // Ensure the directory exists
  await ensureDirectoryExists(configPath);

  // Read existing configuration
  const existingContent = await readFileIfExists(configPath);
  let existingConfig: any = { mcpServers: {} }; // Adjust structure as needed

  if (existingContent) {
    try {
      existingConfig = JSON.parse(existingContent); // Or TOML.parse for TOML
      if (!existingConfig.mcpServers) {
        existingConfig.mcpServers = {};
      }
    } catch (error) {
      console.warn(`Warning: Existing ${configPath} is invalid, creating new configuration`);
      existingConfig = { mcpServers: {} };
    }
  }

  // Convert servers to your agent's format
  for (const server of servers) {
    const agentServer: any = {};

    switch (server.type) {
      case 'stdio':
        // Map stdio server properties
        if (server.command) agentServer.command = server.command;
        if (server.args?.length) agentServer.args = server.args;
        if (server.env && Object.keys(server.env).length) {
          agentServer.env = server.env;
        }
        break;

      case 'http':
      case 'sse':
        // Map remote server properties
        if (server.url) agentServer.url = server.url;
        if (server.headers && Object.keys(server.headers).length) {
          agentServer.headers = server.headers;
        }
        break;
    }

    // Add to config using server name as key
    existingConfig.mcpServers[server.name] = agentServer;
  }

  // Write the updated configuration
  const configContent = JSON.stringify(existingConfig, null, 2); // Or TOML.stringify
  await writeFile(configPath, configContent);
}
```

### 4. Add Optional Filtering/Transformation Logic

If your agent has limitations or requires transformations:

```typescript
filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
  // Example: Filter out SSE servers if not supported
  return servers.filter(server => {
    if (server.type === 'sse' && !this.capabilities.mcp.sse) {
      return false;
    }
    return true;
  });
}

transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
  // Example: Transform remote servers to stdio using a proxy
  return servers.map(server => {
    if (server.type === 'http' && !this.capabilities.mcp.http) {
      // Transform to stdio using a proxy
      return {
        name: server.name,
        type: 'stdio' as MCPServerType,
        command: 'npx',
        args: ['-y', 'mcp-proxy@latest', server.url!],
        env: server.env || {}
      };
    }
    return server;
  });
}
```

### 5. Write Comprehensive Tests

Create `tests/agents/YourAgent.test.ts`:

```typescript
import { YourAgent } from '../../src/agents/YourAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';

// Mock the fs module
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('YourAgent', () => {
  let agent: YourAgent;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    agent = new YourAgent();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(agent.id).toBe('your-agent');
      expect(agent.name).toBe('Your Agent Name');
      // Test all capabilities
      expect(agent.capabilities.mcp.stdio).toBe(true);
      // ... more assertions
    });
  });

  describe('detectPresence', () => {
    it('should detect agent when config files exist', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      
      const result = await agent.detectPresence(testProjectPath);
      
      expect(result).not.toBeNull();
      expect(result?.agent).toBe(agent);
    });
  });

  describe('applyMCPConfig', () => {
    it('should create correct configuration format', async () => {
      const servers: MCPServerConfig[] = [
        {
          name: 'test-server',
          type: MCPServerType.STDIO,
          command: 'test-command',
          args: ['arg1', 'arg2']
        }
      ];

      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce();

      await agent.applyMCPConfig(testProjectPath, servers);

      // Verify the correct configuration was written
      const expectedConfig = {
        mcpServers: {
          'test-server': {
            command: 'test-command',
            args: ['arg1', 'arg2']
          }
        }
      };

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        resolve(testProjectPath, '.youragent/mcp.json'),
        JSON.stringify(expectedConfig, null, 2)
      );
    });
  });

  // Add more tests for filtering, transformations, etc.
});
```

### 6. Register the Agent

Update `src/core/agentManager.ts`:

```typescript
// Add import
import { YourAgent } from '../agents/YourAgent.js';

// Add to registerDefaultAgents method
private registerDefaultAgents(): void {
  this.agents = [
    new ClaudeAgent(),
    new CodexCliAgent(),
    new GeminiCliAgent(),
    new CursorAgent(),
    new YourAgent()  // Add your agent here
  ];
}
```

### 7. Update Documentation

Update relevant documentation files to mention the new agent support.

## Code Examples

### JSON Configuration Agent (like Claude/Cursor)

```typescript
async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
  const mcpConfigPath = this.getNativeMcpPath(projectPath);
  await ensureDirectoryExists(mcpConfigPath);
  
  const existingContent = await readFileIfExists(mcpConfigPath);
  let existingConfig: any = { mcpServers: {} };

  if (existingContent) {
    try {
      existingConfig = JSON.parse(existingContent);
      if (!existingConfig.mcpServers) existingConfig.mcpServers = {};
    } catch (error) {
      console.warn('Warning: Existing config is invalid, creating new configuration');
      existingConfig = { mcpServers: {} };
    }
  }

  for (const server of servers) {
    const configServer: any = {};
    
    switch (server.type) {
      case 'stdio':
        if (server.command) configServer.command = server.command;
        if (server.args?.length) configServer.args = server.args;
        if (server.env && Object.keys(server.env).length) configServer.env = server.env;
        break;
      case 'http':
      case 'sse':
        if (server.url) configServer.url = server.url;
        if (server.headers && Object.keys(server.headers).length) configServer.headers = server.headers;
        break;
    }
    
    existingConfig.mcpServers[server.name] = configServer;
  }

  await writeFile(mcpConfigPath, JSON.stringify(existingConfig, null, 2));
}
```

### TOML Configuration Agent (like Codex CLI)

```typescript
import * as TOML from '@iarna/toml';

async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
  const tomlConfigPath = this.getNativeMcpPath(projectPath);
  await ensureDirectoryExists(tomlConfigPath);

  const existingContent = await readFileIfExists(tomlConfigPath);
  let existingConfig: any = { mcp_servers: {} };

  if (existingContent) {
    try {
      existingConfig = TOML.parse(existingContent);
      if (!existingConfig.mcp_servers) existingConfig.mcp_servers = {};
    } catch (error) {
      console.warn('Warning: Existing TOML is invalid, creating new configuration');
      existingConfig = { mcp_servers: {} };
    }
  }

  const transformedServers = this.transformMCPServers(servers);
  
  for (const server of transformedServers) {
    const tomlServer: any = {};
    
    if (server.command) tomlServer.command = server.command;
    if (server.args?.length) tomlServer.args = server.args;
    if (server.env && Object.keys(server.env).length) tomlServer.env = server.env;
    
    existingConfig.mcp_servers[server.name] = tomlServer;
  }

  const formattedToml = this.formatTOML(TOML.stringify(existingConfig));
  await writeFile(tomlConfigPath, formattedToml);
}

private formatTOML(tomlString: string): string {
  // Custom formatting logic for better readability
  const lines = tomlString.split('\n');
  const formattedLines: string[] = [];
  
  formattedLines.push('# Your Agent MCP Configuration');
  formattedLines.push('# Generated automatically by agentinit');
  formattedLines.push('');
  
  // Add formatting logic here
  return formattedLines.join('\n') + '\n';
}
```

## Real-World Example: CursorAgent

Here's a complete real-world example showing how CursorAgent was implemented in the AgentInit codebase.

### 1. Research Phase

Before implementing CursorAgent, we researched Cursor's MCP configuration:

- **Configuration file**: `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global)
- **Format**: JSON with `mcpServers` object
- **Transport support**: stdio, HTTP, and SSE
- **Detection files**: `.cursorrules`, `.cursor/settings.json`, `.cursor/mcp.json`
- **Documentation**: https://docs.cursor.com/context/model-context-protocol

### 2. Complete CursorAgent Implementation

```typescript
// src/agents/CursorAgent.ts
import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition } from '../types/index.js';

/**
 * Cursor IDE agent implementation
 * Supports full MCP capabilities including stdio, HTTP, and SSE servers
 * Native config: .cursor/mcp.json
 */
export class CursorAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'cursor',
      name: 'Cursor IDE',
      url: 'https://docs.cursor.com/context/model-context-protocol',
      capabilities: {
        mcp: {
          stdio: true,
          http: true,
          sse: true
        },
        rules: true,        // Supports .cursorrules
        hooks: false,       // No hook system
        commands: false,    // No custom commands
        subagents: false,   // No subagent support
        statusline: false   // No statusline customization
      },
      configFiles: ['.cursorrules', '.cursor/settings.json', '.cursor/mcp.json'],
      nativeConfigPath: '.cursor/mcp.json'
    };

    super(definition);
  }

  /**
   * Apply MCP configuration to Cursor's native .cursor/mcp.json format
   */
  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    const mcpConfigPath = this.getNativeMcpPath(projectPath);
    
    // Ensure the directory exists
    await ensureDirectoryExists(mcpConfigPath);

    // Read existing configuration
    const existingContent = await readFileIfExists(mcpConfigPath);
    let existingConfig: any = { mcpServers: {} };

    if (existingContent) {
      try {
        existingConfig = JSON.parse(existingContent);
        if (!existingConfig.mcpServers) {
          existingConfig.mcpServers = {};
        }
      } catch (error) {
        console.warn('Warning: Existing .cursor/mcp.json is invalid, creating new configuration');
        existingConfig = { mcpServers: {} };
      }
    }

    // Convert our MCP server configs to Cursor's format
    for (const server of servers) {
      const cursorServer: any = {};

      switch (server.type) {
        case 'stdio':
          if (server.command) {
            cursorServer.command = server.command;
          }
          if (server.args && server.args.length > 0) {
            cursorServer.args = server.args;
          }
          if (server.env && Object.keys(server.env).length > 0) {
            cursorServer.env = server.env;
          }
          break;

        case 'http':
        case 'sse':
          if (server.url) {
            cursorServer.url = server.url;
          }
          if (server.headers && Object.keys(server.headers).length > 0) {
            cursorServer.headers = server.headers;
          }
          break;
      }

      // Add or update the server in the config
      existingConfig.mcpServers[server.name] = cursorServer;
    }

    // Write the updated configuration
    const configJson = JSON.stringify(existingConfig, null, 2);
    await writeFile(mcpConfigPath, configJson);
  }

  /**
   * Cursor supports all MCP server types, so no filtering needed
   */
  filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // Cursor supports everything
  }

  /**
   * Cursor doesn't need any transformations
   */
  transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
    return servers; // No transformations needed
  }
}
```

### 3. AgentManager Registration

```typescript
// src/core/agentManager.ts
import { CursorAgent } from '../agents/CursorAgent.js';

private registerDefaultAgents(): void {
  this.agents = [
    new ClaudeAgent(),
    new CodexCliAgent(),
    new GeminiCliAgent(),
    new CursorAgent()  // Added here
  ];
}
```

### 4. Generated Configuration Example

When a user runs:
```bash
agentinit apply --mcp-stdio filesystem "npx -y @modelcontextprotocol/server-filesystem" --args "/allowed/path"
```

CursorAgent creates `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/allowed/path"
      ]
    }
  }
}
```

### 5. Key Implementation Decisions

**Why these config files for detection?**
- `.cursorrules`: Most common Cursor-specific file
- `.cursor/settings.json`: Cursor's main settings file
- `.cursor/mcp.json`: Direct MCP configuration file

**Why no transformations needed?**
- Cursor supports all three MCP transport types natively
- Configuration format is straightforward and compatible

**Global configuration support**:
- Added `globalConfigPath: '~/.cursor/mcp.json'` for global configurations
- Enables `--global` flag usage for system-wide MCP setup

**Error handling strategy**:
- Gracefully handle invalid JSON in existing configs
- Create directory structure if it doesn't exist
- Merge with existing configurations to preserve user customizations

### 6. Testing Strategy

The CursorAgent tests cover:
- All constructor properties and capabilities
- Detection with each config file type
- Configuration creation and merging
- Error handling for invalid JSON
- All MCP server types (stdio, HTTP, SSE)

This real-world example demonstrates the complete process from research to implementation, showing practical decisions and their rationale.

## Global Configuration Support

AgentInit now supports global MCP configurations that apply across all projects for a specific agent. This section explains how to add global configuration support to your agent.

### 1. Adding Global Config Paths

When defining your agent, add global configuration paths:

```typescript
const definition: AgentDefinition = {
  id: 'your-agent',
  name: 'Your Agent Name',
  // ... other properties
  nativeConfigPath: '.youragent/mcp.json',
  
  // Option 1: Single global path (works on all platforms)
  globalConfigPath: '~/.youragent/global-mcp.json',
  
  // Option 2: Platform-specific paths
  globalConfigPaths: {
    windows: '%APPDATA%/YourAgent/mcp.json',
    darwin: '~/Library/Application Support/YourAgent/mcp.json',
    linux: '~/.config/youragent/mcp.json'
  }
};
```

### 2. Path Resolution

The system automatically handles:
- **Tilde expansion**: `~` becomes the user's home directory
- **Environment variables**: `%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%` on Windows
- **Platform detection**: Automatically selects the right path for the current OS

### 3. Global-Only Agents

Some agents (like Claude Desktop) only support global configuration:

```typescript
export class ClaudeDesktopAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      configFiles: [], // No project-level detection
      nativeConfigPath: 'claude_desktop_config.json', // Not used for projects
      globalConfigPaths: {
        windows: '%APPDATA%/Claude/claude_desktop_config.json',
        darwin: '~/Library/Application Support/Claude/claude_desktop_config.json',
        linux: '~/.config/Claude/claude_desktop_config.json'
      }
    };
    super(definition);
  }

  // Disable project-level detection
  async detectPresence(): Promise<null> {
    return null;
  }

  // Prevent project-level configuration
  async applyMCPConfig(): Promise<void> {
    throw new Error('Claude Desktop only supports global configuration. Use --global flag.');
  }

  // Override global config method if needed for different format
  async applyGlobalMCPConfig(servers: MCPServerConfig[]): Promise<void> {
    // Custom global configuration logic
  }
}
```

### 4. Usage Examples

Users can then use the global flag:

```bash
# Apply globally to specific agent
agentinit apply --global --agent claude \
  --mcp-stdio filesystem "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/username/Documents"

# Apply globally to Claude Desktop
agentinit apply --global --agent claude-desktop \
  --mcp-http github "https://api.github.com/mcp" \
  --auth "Bearer ghp_xxxxx"
```

### 5. Testing Global Functionality

Test global configuration support:

```typescript
describe('global configuration', () => {
  it('should support global configuration', () => {
    expect(agent.supportsGlobalConfig()).toBe(true);
  });

  it('should return global config path', () => {
    const globalPath = agent.getGlobalMcpPath();
    expect(globalPath).toContain('global');
  });

  it('should apply global configuration', async () => {
    await agent.applyGlobalMCPConfig(mockServers);
    // Verify global config file was written
  });
});
```

### 6. Best Practices

- **Use appropriate paths**: Follow platform conventions for global config locations
- **Handle missing directories**: Global config paths may not exist initially
- **Preserve user data**: Merge with existing global configurations
- **Clear error messages**: Help users understand when global config isn't supported
- **Documentation**: Clearly document where global configs are stored

## Testing Guidelines

### 1. Test Structure

Each agent should have comprehensive tests covering:
- Constructor and property initialization
- Agent detection with various config files
- MCP configuration application (new and existing configs)
- Error handling (invalid JSON, missing directories)
- Server filtering and transformation
- Edge cases and boundary conditions

### 2. Mock Strategy

Use Jest mocks for file system operations:

```typescript
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  }
}));
```

### 3. Test Data

Create realistic test data that matches real-world usage:

```typescript
const mockServers: MCPServerConfig[] = [
  {
    name: 'filesystem',
    type: MCPServerType.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/files'],
    env: { DEBUG: 'mcp:*' }
  },
  {
    name: 'github',
    type: MCPServerType.HTTP,
    url: 'https://api.github.com/mcp',
    headers: { Authorization: 'Bearer ghp_xxxx' }
  }
];
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run specific agent tests  
npm test -- tests/agents/YourAgent.test.ts

# Run with coverage
npm test -- --coverage
```

## Common Patterns

### 1. Configuration File Detection

Most agents follow this pattern for detection:

```typescript
configFiles: [
  '.agent-config',           // Simple config file
  '.agent/settings.json',    // Settings directory
  '.agent/mcp.json'          // Specific MCP config
]
```

### 2. Capability Mapping

Define capabilities based on what the agent actually supports:

```typescript
capabilities: {
  mcp: {
    stdio: true,    // Can run local MCP servers
    http: true,     // Can connect to HTTP MCP servers
    sse: false      // Cannot handle SSE (legacy)
  },
  rules: true,      // Supports .rules files
  hooks: false,     // No hook system
  commands: true,   // Has custom commands
  subagents: false, // No subagent support
  statusline: true  // Can customize status line
}
```

### 3. Error Handling

Always handle configuration errors gracefully:

```typescript
try {
  existingConfig = JSON.parse(existingContent);
  if (!existingConfig.mcpServers) {
    existingConfig.mcpServers = {};
  }
} catch (error) {
  console.warn(`Warning: Existing ${this.nativeConfigPath} is invalid, creating new configuration`);
  existingConfig = { mcpServers: {} };
}
```

### 4. Directory Creation

Ensure parent directories exist:

```typescript
await ensureDirectoryExists(mcpConfigPath);
```

## Troubleshooting

### Common Issues

1. **Agent Not Detected**
   - Check that `configFiles` array includes the correct file paths
   - Verify the files actually exist in test projects
   - Ensure the agent is registered in `AgentManager`

2. **Configuration Not Applied**
   - Verify the `nativeConfigPath` is correct
   - Check that the configuration format matches the agent's expectations
   - Test with a minimal configuration first

3. **Tests Failing**
   - Ensure all fs operations are properly mocked
   - Check that test data matches expected format
   - Verify async operations are properly awaited

4. **Type Errors**
   - Import types from `../types/index.js`
   - Use the correct `MCPServerType` enum values
   - Ensure agent definition properties are correctly typed

### Debugging Tips

1. **Add Logging**: Use `console.log` for debugging during development
2. **Test Manually**: Create a test project and run `agentinit apply` with your agent
3. **Check File Output**: Verify the generated configuration files are correct
4. **Use TypeScript Compiler**: Run `tsc --noEmit` to check for type errors

## Best Practices

### 1. Code Quality
- Follow the existing code style and patterns
- Use meaningful variable names
- Add comprehensive JSDoc comments
- Handle errors gracefully

### 2. Configuration Management
- Always merge with existing configurations
- Preserve user customizations when possible
- Use atomic file operations (read, modify, write)
- Validate configuration before writing

### 3. Testing
- Aim for high test coverage (>90%)
- Test both happy path and error scenarios
- Use realistic test data
- Mock external dependencies consistently

### 4. Documentation
- Update this guide with any new patterns
- Document any special requirements or limitations
- Provide examples for complex configurations
- Keep documentation in sync with code

### 5. Backward Compatibility
- Don't break existing functionality
- Deprecate features gracefully
- Provide migration paths for configuration changes
- Test with existing projects

## Conclusion

Adding a new agent to AgentInit follows a consistent pattern:
1. Research the agent's MCP configuration requirements
2. Implement the agent class extending the base `Agent` class
3. Write comprehensive tests
4. Register the agent in `AgentManager`
5. Update documentation

The architecture is designed to be extensible while maintaining consistency and reliability. Following this guide ensures your agent integration will be robust and maintainable.

For questions or help, please refer to the existing agent implementations as examples or consult the project maintainers.