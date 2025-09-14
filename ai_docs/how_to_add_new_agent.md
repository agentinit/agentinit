# How to Add a New Agent to AgentInit

## Overview

AgentInit uses a plugin-based architecture with:
- **Agent Base Class**: Abstract interface (`src/agents/Agent.ts`)
- **Agent Implementations**: Concrete classes (e.g., `ClaudeAgent`, `CursorAgent`)
- **Agent Manager**: Registration and detection (`src/core/agentManager.ts`)
- **MCP Filter**: Compatibility filtering (`src/core/mcpFilter.ts`)
- **Configuration Merger**: Config merging (`src/core/configMerger.ts`)

## Quick Start

### 1. Research Target Agent
- Configuration file(s) and format (JSON/TOML/YAML)
- MCP transport support (stdio/HTTP/SSE)
- Capabilities (rules, hooks, commands, subagents)
- Detection files

### 2. Create Agent Class

```typescript
// src/agents/YourAgent.ts
import { resolve } from 'path';
import { Agent } from './Agent.js';
import { readFileIfExists, writeFile, ensureDirectoryExists } from '../utils/fs.js';
import type { MCPServerConfig, AgentDefinition } from '../types/index.js';

export class YourAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'your-agent',
      name: 'Your Agent Name',
      url: 'https://docs.example.com/mcp',
      capabilities: {
        mcp: { stdio: true, http: true, sse: false },
        rules: true,
        hooks: false,
        commands: true,
        subagents: false,
        statusline: true
      },
      configFiles: ['.youragent', '.youragent/config.json'],
      nativeConfigPath: '.youragent/mcp.json'
    };
    super(definition);
  }

  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    const configPath = this.getNativeMcpPath(projectPath);
    await ensureDirectoryExists(configPath);

    const existingContent = await readFileIfExists(configPath);
    let existingConfig: any = { mcpServers: {} };

    if (existingContent) {
      try {
        existingConfig = JSON.parse(existingContent);
        if (!existingConfig.mcpServers) existingConfig.mcpServers = {};
      } catch {
        console.warn('Warning: Existing config invalid, creating new');
        existingConfig = { mcpServers: {} };
      }
    }

    for (const server of servers) {
      const agentServer: any = {};
      
      switch (server.type) {
        case 'stdio':
          if (server.command) agentServer.command = server.command;
          if (server.args?.length) agentServer.args = server.args;
          if (server.env && Object.keys(server.env).length) agentServer.env = server.env;
          break;
        case 'http':
        case 'sse':
          if (server.url) agentServer.url = server.url;
          if (server.headers && Object.keys(server.headers).length) agentServer.headers = server.headers;
          break;
      }
      
      existingConfig.mcpServers[server.name] = agentServer;
    }

    await writeFile(configPath, JSON.stringify(existingConfig, null, 2));
  }
}
```

### 3. Optional Filtering/Transformation

```typescript
filterMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
  return servers.filter(server => server.type !== 'sse' || this.capabilities.mcp.sse);
}

transformMCPServers(servers: MCPServerConfig[]): MCPServerConfig[] {
  return servers.map(server => {
    if (server.type === 'http' && !this.capabilities.mcp.http) {
      return {
        ...server,
        type: 'stdio' as MCPServerType,
        command: 'npx',
        args: ['-y', 'mcp-proxy@latest', server.url!]
      };
    }
    return server;
  });
}
```

### 4. Implement Rules Support (Optional)

```typescript
// Add to your agent class
import type { AppliedRules, RuleSection } from '../types/rules.js';

async applyRulesConfig(configPath: string, rules: AppliedRules, existingContent: string): Promise<string> {
  // Agent-specific rules formatting
  const rulesSection = this.generateRulesContent(rules.sections);
  return existingContent + '\n\n' + rulesSection;
}

extractExistingRules(content: string): string[] {
  // Parse existing rules from agent's format
  return content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
}

extractExistingSections(content: string): RuleSection[] {
  // Parse sections from agent's format
  const sections: RuleSection[] = [];
  // ... parsing logic for your format
  return sections;
}

generateRulesContent(sections: RuleSection[]): string {
  // Generate rules in agent's format
  return sections.map(section => 
    `# ${section.templateName}\n${section.rules.join('\n')}\n`
  ).join('\n');
}
```

### 5. Register Agent

```typescript
// src/core/agentManager.ts
import { YourAgent } from '../agents/YourAgent.js';

private registerDefaultAgents(): void {
  this.agents = [
    new ClaudeAgent(),
    new CodexCliAgent(),
    new GeminiCliAgent(),
    new CursorAgent(),
    new YourAgent()  // Add here
  ];
}
```

## Configuration Formats

### JSON Agent (Claude/Cursor style)
```typescript
async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
  const configPath = this.getNativeMcpPath(projectPath);
  await ensureDirectoryExists(configPath);
  
  let config: any = { mcpServers: {} };
  const existing = await readFileIfExists(configPath);
  
  if (existing) {
    try { config = JSON.parse(existing); } catch { /* use default */ }
  }
  
  for (const server of servers) {
    const serverConfig: any = {};
    if (server.command) serverConfig.command = server.command;
    if (server.args?.length) serverConfig.args = server.args;
    if (server.env && Object.keys(server.env).length) serverConfig.env = server.env;
    if (server.url) serverConfig.url = server.url;
    if (server.headers && Object.keys(server.headers).length) serverConfig.headers = server.headers;
    config.mcpServers[server.name] = serverConfig;
  }
  
  await writeFile(configPath, JSON.stringify(config, null, 2));
}
```

### TOML Agent (Codex CLI style)
```typescript
import * as TOML from '@iarna/toml';

async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
  const configPath = this.getNativeMcpPath(projectPath);
  await ensureDirectoryExists(configPath);
  
  let config: any = { mcp_servers: {} };
  const existing = await readFileIfExists(configPath);
  
  if (existing) {
    try { config = TOML.parse(existing); } catch { /* use default */ }
  }
  
  for (const server of this.transformMCPServers(servers)) {
    const serverConfig: any = {};
    if (server.command) serverConfig.command = server.command;
    if (server.args?.length) serverConfig.args = server.args;
    if (server.env && Object.keys(server.env).length) serverConfig.env = server.env;
    config.mcp_servers[server.name] = serverConfig;
  }
  
  await writeFile(configPath, TOML.stringify(config));
}
```

## Global Configuration Support

### Basic Global Config
```typescript
const definition: AgentDefinition = {
  // ... other properties
  globalConfigPath: '~/.youragent/global-mcp.json'
};
```

### Platform-Specific Paths
```typescript
globalConfigPaths: {
  windows: '%APPDATA%/YourAgent/mcp.json',
  darwin: '~/Library/Application Support/YourAgent/mcp.json',
  linux: '~/.config/youragent/mcp.json'
}
```

### Global-Only Agents
```typescript
export class GlobalOnlyAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      // ... properties
      configFiles: [], // No project detection
      globalConfigPaths: { /* platform paths */ }
    };
    super(definition);
  }

  async detectPresence(): Promise<null> { return null; }
  
  async applyMCPConfig(): Promise<void> {
    throw new Error('Use --global flag for this agent');
  }
}
```

## Testing

### Test Structure
```typescript
// tests/agents/YourAgent.test.ts
import { YourAgent } from '../../src/agents/YourAgent.js';
import { MCPServerType } from '../../src/types/index.js';
import { promises as fs } from 'fs';

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
  
  beforeEach(() => {
    agent = new YourAgent();
    jest.clearAllMocks();
  });

  it('should initialize correctly', () => {
    expect(agent.id).toBe('your-agent');
    expect(agent.capabilities.mcp.stdio).toBe(true);
  });

  it('should detect presence', async () => {
    mockFs.access.mockResolvedValueOnce(undefined);
    const result = await agent.detectPresence('/test/project');
    expect(result).not.toBeNull();
  });

  it('should apply MCP config', async () => {
    const servers = [{
      name: 'test',
      type: MCPServerType.STDIO,
      command: 'test-cmd',
      args: ['arg1']
    }];

    mockFs.readFile.mockRejectedValueOnce(new Error('Not found'));
    mockFs.mkdir.mockResolvedValueOnce(undefined);
    mockFs.writeFile.mockResolvedValueOnce();

    await agent.applyMCPConfig('/test/project', servers);

    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.youragent/mcp.json'),
      expect.stringContaining('"test-cmd"')
    );
  });
});
```

### Run Tests
```bash
npm test
npm test -- tests/agents/YourAgent.test.ts
npm test -- --coverage
```

## Real Example: CursorAgent

```typescript
export class CursorAgent extends Agent {
  constructor() {
    const definition: AgentDefinition = {
      id: 'cursor',
      name: 'Cursor IDE',
      url: 'https://docs.cursor.com/context/model-context-protocol',
      capabilities: {
        mcp: { stdio: true, http: true, sse: true },
        rules: true,
        hooks: false,
        commands: false,
        subagents: false,
        statusline: false
      },
      configFiles: ['.cursorrules', '.cursor/settings.json', '.cursor/mcp.json'],
      nativeConfigPath: '.cursor/mcp.json'
    };
    super(definition);
  }

  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    const configPath = this.getNativeMcpPath(projectPath);
    await ensureDirectoryExists(configPath);

    let config: any = { mcpServers: {} };
    const existing = await readFileIfExists(configPath);
    
    if (existing) {
      try {
        config = JSON.parse(existing);
        if (!config.mcpServers) config.mcpServers = {};
      } catch {
        console.warn('Warning: Invalid .cursor/mcp.json, creating new');
        config = { mcpServers: {} };
      }
    }

    for (const server of servers) {
      const cursorServer: any = {};
      
      if (server.command) cursorServer.command = server.command;
      if (server.args?.length) cursorServer.args = server.args;
      if (server.env && Object.keys(server.env).length) cursorServer.env = server.env;
      if (server.url) cursorServer.url = server.url;
      if (server.headers && Object.keys(server.headers).length) cursorServer.headers = server.headers;
      
      config.mcpServers[server.name] = cursorServer;
    }

    await writeFile(configPath, JSON.stringify(config, null, 2));
  }
}
```

## Common Patterns

### Detection Files
```typescript
configFiles: [
  '.agent-config',           // Simple config
  '.agent/settings.json',    // Settings dir
  '.agent/mcp.json'          // MCP config
]
```

### Capability Mapping
```typescript
capabilities: {
  mcp: { stdio: true, http: true, sse: false },
  rules: true,      // .rules files
  hooks: false,     // Hook system
  commands: true,   // Custom commands
  subagents: false, // Subagent support
  statusline: true  // Status customization
}
```

### Error Handling
```typescript
try {
  config = JSON.parse(existing);
} catch (error) {
  console.warn(`Warning: Invalid config, creating new`);
  config = defaultConfig;
}
```

## Troubleshooting

**Agent Not Detected:**
- Check `configFiles` paths
- Verify files exist
- Ensure agent registered in `AgentManager`

**Config Not Applied:**
- Verify `nativeConfigPath`
- Check configuration format
- Test with minimal config

**Tests Failing:**
- Mock all fs operations
- Check test data format
- Await async operations

**Type Errors:**
- Import from `../types/index.js`
- Use `MCPServerType` enum
- Check agent definition types

## Commands

```bash
# Test your agent
agentinit detect
agentinit apply --mcp-stdio test "echo" --args "hello"

# Run tests
npm test -- tests/agents/YourAgent.test.ts

# Global config
agentinit apply --global --agent your-agent --mcp-stdio test "cmd"
```

## Checklist

- [ ] Research agent's MCP format and capabilities
- [ ] Create agent class extending `Agent`
- [ ] Implement `applyMCPConfig` method
- [ ] Implement rules methods (if `capabilities.rules: true`)
- [ ] Add optional filtering/transformation
- [ ] Register in `AgentManager`
- [ ] Write comprehensive tests
- [ ] Test with real agent
- [ ] Update documentation