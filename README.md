# AgentInit

> A CLI tool for managing and configuring AI coding agents

AgentInit transforms AI agent configuration from a fragmented, manual process into a unified, automated workflow that ensures every developer gets consistent, context-aware AI assistance tailored to their project's specific needs.

## ✨ Features

- **🤖 Universal Agent Configuration**: Unified `agents.md` file that syncs with all major AI coding agents
- **🔍 Smart Stack Detection**: Automatically detects project language, framework, and tools
- **🔄 Bidirectional Sync**: Keep agent configurations in sync across Claude, Cursor, Windsurf, and more
- **📦 MCP Management**: Interactive installation and management of Model Context Protocol tools
- **📋 Rules Templates**: Apply coding best practices with predefined rule templates (Git, testing, docs, linting)
- **⚙️ Project Templates**: Pre-built templates for web apps, CLI tools, libraries, and more
- **🎯 Stack-Aware Guidance**: Customized instructions based on your technology stack

## 🚀 Quick Start

### Installation

```bash
# Install AgentInit globally
npm install -g agentinit
```

### Basic Usage

```bash
# Initialize agent configuration for your project
agentinit init

# Detect current project stack and existing configurations
agentinit detect

# Sync agents.md with agent-specific files
agentinit sync

# Add and verify an MCP server
agentinit mcp add --verify \
  --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything"
```

## 📋 Commands

### `agentinit init`

Initialize agents.md configuration for your project.

```bash
agentinit init                    # Interactive project setup
agentinit init --template web     # Use web app template
agentinit init --force            # Overwrite existing configuration
```

**Available Templates:**
- `web` - Web applications (React, Vue, Angular)
- `cli` - Command line tools
- `library` - Libraries and packages
- `fullstack` - Full-stack applications
- `mobile` - Mobile applications

### `agentinit detect`

Detect current project stack and existing agent configurations.

```bash
agentinit detect           # Basic detection (only shows found agents)
agentinit detect --verbose # Detailed information
DEBUG=1 agentinit detect   # Show all supported agents (found and not found)
```

**Environment Variables:**
- `DEBUG=1` - Shows all supported agents, including those not found in the project

### `agentinit sync`

Sync agents.md with agent-specific configuration files.

```bash
agentinit sync                # Sync configurations
agentinit sync --dry-run      # Preview changes
agentinit sync --backup       # Create backups
```

### `agentinit mcp`

Manage Model Context Protocol server configurations.

**Examples:**
```bash
# Add a project-local STDIO server
agentinit mcp add \
  --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything"

# Add multiple servers and verify them immediately
agentinit mcp add --verify \
  --mcp-stdio supabase "npx -y @supabase/mcp-server-supabase@latest" \
    --args "--read-only --project-ref=<project-ref>" \
    --env "SUPABASE_ACCESS_TOKEN=<personal-access-token>" \
  --mcp-http notion_api "https://mcp.notion.com/mcp"

# Manage global MCP config for a specific agent
agentinit mcp list --global --agent claude
agentinit mcp remove notion_api --global --agent claude

# Verify existing configs or direct MCP args
agentinit mcp verify --all
agentinit mcp verify --name exa
agentinit mcp verify --mcp-http notion_api "https://mcp.notion.com/mcp" --timeout 30000
```

Shows connection status, response time, and available tools/resources/prompts for each MCP server.

**MCP Authentication Options**:
- `--auth "Bearer TOKEN"` - Adds Authorization header for Bearer token authentication
- `--header "KEY:VALUE"` - Adds custom headers in KEY:VALUE format (can be used multiple times)
- Both flags can be combined for APIs requiring multiple authentication methods

### `agentinit rules`

Manage coding rules independently from MCP configuration.

**Examples:**
```bash
# Add rules from templates, raw text, files, or URLs
agentinit rules add --template git,write_tests,use_linter
agentinit rules add --template git --raw "Use TypeScript strict mode"
agentinit rules add --file ./project-rules.md

# Inspect and remove configured rules
agentinit rules list
agentinit rules remove git write_tests

# Apply globally when the target agent supports global rules
agentinit rules add --global --agent claude --template git,write_tests
```

**Available Rule Templates:**
- `git` - Enforce Git workflows and commit standards
- `write_docs` - Require comprehensive documentation
- `use_git_worktrees` - Enable parallel development with worktrees
- `use_subagents` - Delegate work to specialized subagents
- `use_linter` - Enforce code quality and formatting
- `write_tests` - Implement test-driven development practices

### `agentinit skills`

Install, list, and remove reusable agent skills from local paths or GitHub repositories.

**Examples:**
```bash
# Inspect a source before installing
agentinit skills add owner/repo --list

# Install all discovered skills for detected agents
agentinit skills add ./skills

# Install selected skills globally for a specific agent
agentinit skills add owner/repo --global --agent claude --skill openai-docs

# Review and clean up installed skills
agentinit skills list
agentinit skills remove openai-docs
```

### Deprecated compatibility

`agentinit apply` and `agentinit verify_mcp` still work as compatibility shims, but new automation should prefer `agentinit mcp ...`, `agentinit rules ...`, and `agentinit skills ...`.

## 🏗️ Project Structure

AgentInit creates and manages these key files:

```
your-project/
├── agents.md                 # Universal agent configuration
├── CLAUDE.md                 # Claude-specific config (synced)
├── .cursor/rules/            # Cursor rules (MDC files)
│   ├── 001_workspace.mdc
│   └── 002_frontend.mdc
├── AGENTS.md                 # Simple agent instructions (alternative)
└── .windsurfrules           # Windsurf-specific config (synced)
```

## 📖 Configuration

### agents.md Structure

The `agents.md` file is the single source of truth for all agent configurations:

```markdown
# Agent Configuration for MyProject

**Stack**: typescript with next.js
**Generated**: 2025-08-15
**Package Manager**: npm

## Project Context
This is a TypeScript project using Next.js...

## Development Guidelines
### Code Quality
- Write clean, maintainable code...

### Testing Strategy
- Write unit tests using Jest...

## Agent Instructions
### General Behavior
- Always analyze existing codebase...

## Sub-Agents
### Code Reviewer
**Role**: Review code for quality and security...
```

### Supported Agents

| Agent | Config File | Status |
|-------|-------------|--------|
| Claude | `CLAUDE.md` | ✅ |
| Cursor | `.cursor/rules/*.mdc` or `AGENTS.md` | ✅ |
| Windsurf | `.windsurfrules` | ✅ |
| Copilot | `.github/copilot.yml` | 🚧 |
| Codeium | `.codeium/config.json` | 🚧 |

## 🔧 Stack Detection

AgentInit automatically detects your project's technology stack:

**Detection Priority:**
1. **Lock files** (most reliable): `package-lock.json`, `yarn.lock`, `Cargo.lock`, etc.
2. **Manifest files**: `package.json`, `Cargo.toml`, `go.mod`, etc.
3. **Config files**: `next.config.js`, `vite.config.js`, `tsconfig.json`, etc.
4. **File patterns**: `*.py`, `*.rs`, `*.go`, etc.

**Supported Stacks:**
- JavaScript/TypeScript (React, Vue, Angular, Next.js, Express)
- Python (Django, Flask, FastAPI)
- Rust (Cargo projects)
- Go (Go modules)
- Java (Maven, Gradle)

## 📦 MCP Registry

AgentInit includes a curated registry of popular MCPs:

| MCP | Category | Description |
|-----|----------|-------------|
| playwright | testing | E2E testing and browser automation |
| context7 | documentation | Fetch and analyze documentation |
| sequential-thinking | quality | Enhanced AI reasoning |
| agent-warden | quality | Prevent common AI mistakes |
| supabase-mcp | database | Supabase integration |
| git-mcp | version-control | Enhanced Git operations |

## 📚 Library API

AgentInit can be used as a library in your Node.js/TypeScript applications for programmatic MCP server verification and management.

> **📖 Full Documentation:** See [src/lib/verifier/README.md](src/lib/verifier/README.md) for complete API reference, examples, and advanced usage.

### Installation

```bash
npm install agentinit
# or
yarn add agentinit
# or
bun add agentinit
```

### Basic Usage

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
  console.log(`✅ Connected to ${result.server.name}`);
  console.log(`Tools: ${result.capabilities?.tools.length}`);
  console.log(`Total tokens: ${result.capabilities?.totalToolTokens}`);
}
```

### Advanced Features

The verifier supports additional options for detailed inspection:

```typescript
// Fetch resource contents and prompt templates
const result = await verifier.verifyServer(
  serverConfig,
  {
    timeout: 15000,
    includeResourceContents: true,  // Fetch actual resource data
    includePromptDetails: true,     // Fetch prompt templates
    includeTokenCounts: true        // Calculate token usage (default)
  }
);

// Access detailed tool parameters
result.capabilities?.tools.forEach(tool => {
  console.log(`\nTool: ${tool.name}`);

  if (tool.inputSchema?.properties) {
    Object.entries(tool.inputSchema.properties).forEach(([name, schema]) => {
      console.log(`  - ${name}: ${schema.type} ${schema.description || ''}`);
    });
  }
});
```

### Submodule Imports

For better tree-shaking, import from specific submodules:

```typescript
// Import specific modules
import { MCPVerifier } from 'agentinit/verifier';
import { MCPServerType } from 'agentinit/types';
import type {
  MCPServerConfig,
  MCPVerificationResult,
  MCPVerificationOptions
} from 'agentinit/types';
import { countTokens, MCPParser } from 'agentinit/utils';
```

### Examples

#### Verify STDIO MCP Server

```typescript
import { MCPVerifier, MCPServerType } from 'agentinit';

const verifier = new MCPVerifier(10000); // 10 second timeout

const result = await verifier.verifyServer({
  name: 'filesystem',
  type: MCPServerType.STDIO,
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
  env: {
    NODE_ENV: 'production'
  }
});

if (result.status === 'success') {
  result.capabilities?.tools.forEach(tool => {
    const tokens = result.capabilities?.toolTokenCounts?.get(tool.name) || 0;
    console.log(`  • ${tool.name} (${tokens} tokens)`);
  });
}
```

#### Verify HTTP MCP Server

```typescript
import { MCPVerifier, MCPServerType } from 'agentinit';

const result = await verifier.verifyServer({
  name: 'github-api',
  type: MCPServerType.HTTP,
  url: 'https://api.example.com/mcp',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  }
});
```

#### Verify Multiple Servers

```typescript
import { MCPVerifier, MCPServerType } from 'agentinit/verifier';

const servers = [
  {
    name: 'everything',
    type: MCPServerType.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything']
  },
  {
    name: 'api-server',
    type: MCPServerType.HTTP,
    url: 'https://api.example.com/mcp'
  }
];

const verifier = new MCPVerifier();
const results = await verifier.verifyServers(servers);

// Display formatted results
console.log(verifier.formatResults(results));

// Or process results programmatically
const successful = results.filter(r => r.status === 'success').length;
console.log(`${successful}/${results.length} servers verified`);

// Inspect tool parameters and token usage
results.forEach(result => {
  if (result.status === 'success' && result.capabilities) {
    console.log(`\n${result.server.name}:`);
    result.capabilities.tools.forEach(tool => {
      const tokens = result.capabilities?.toolTokenCounts?.get(tool.name) || 0;
      console.log(`  • ${tool.name} (${tokens} tokens)`);
    });
  }
});
```

#### Count Tokens

```typescript
import { countTokens } from 'agentinit/utils';

const text = 'Hello, world!';
const tokens = countTokens(text);
console.log(`Token count: ${tokens}`);
```

#### Parse MCP Configuration

```typescript
import { MCPParser } from 'agentinit/utils';

const args = ['--mcp-stdio', 'test', 'node', 'server.js', '--args', 'arg1 arg2'];
const parsed = MCPParser.parseArguments(args);

console.log(parsed.servers); // Array of MCPServerConfig
```

### API Reference

#### MCPVerifier

**Constructor**
```typescript
new MCPVerifier(defaultTimeout?: number)
```

**Methods**
- `verifyServer(config: MCPServerConfig, options?: MCPVerificationOptions): Promise<MCPVerificationResult>` - Verify a single MCP server
- `verifyServers(configs: MCPServerConfig[], options?: MCPVerificationOptions): Promise<MCPVerificationResult[]>` - Verify multiple servers in parallel
- `formatResults(results: MCPVerificationResult[]): string` - Format verification results for display

**MCPVerificationOptions**
```typescript
interface MCPVerificationOptions {
  timeout?: number;                    // Connection timeout (ms)
  includeResourceContents?: boolean;   // Fetch resource data
  includePromptDetails?: boolean;      // Fetch prompt templates
  includeTokenCounts?: boolean;        // Calculate tokens (default: true)
}
```

#### Types

**MCPServerType**
```typescript
enum MCPServerType {
  STDIO = 'stdio',
  HTTP = 'http',
  SSE = 'sse'
}
```

**MCPServerConfig**
```typescript
interface MCPServerConfig {
  name: string;
  type: MCPServerType;

  // For STDIO servers
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // For HTTP/SSE servers
  url?: string;
  headers?: Record<string, string>;
}
```

**MCPVerificationResult**
```typescript
interface MCPVerificationResult {
  server: MCPServerConfig;
  status: 'success' | 'error' | 'timeout';
  capabilities?: MCPCapabilities;
  error?: string;
  connectionTime?: number;
}
```

**MCPCapabilities**
```typescript
interface MCPCapabilities {
  tools: MCPTool[];           // Available tools with input schemas
  resources: MCPResource[];   // Available resources (with optional contents)
  prompts: MCPPrompt[];       // Available prompts (with optional templates)
  serverInfo?: {
    name: string;
    version: string;
  };
  totalToolTokens?: number;         // Total token usage for all tools
  toolTokenCounts?: Map<string, number>;  // Token count per tool
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;  // JSON Schema defining parameters
}

interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  contents?: string | Uint8Array;  // Only if includeResourceContents is true
}

interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  template?: string;  // Only if includePromptDetails is true
}
```

> **📝 Note:** For detailed examples on working with tool parameters, resource contents, and prompt templates, see the [full library documentation](src/lib/verifier/README.md).

## 🛠️ Development

### Building from Source

```bash
# Clone the repository
git clone <repository-url>
cd agentinit

# Install dependencies
bun install

# Build the project
bun run build

# Run locally
node dist/index.js --help
```

### Project Structure

```
src/
├── commands/          # CLI commands
│   ├── init.ts       # Project initialization
│   ├── detect.ts     # Stack detection
│   ├── sync.ts       # Configuration sync
│   └── mcp.ts        # MCP management
├── core/             # Core functionality
│   ├── agentDetector.ts    # Agent detection
│   ├── stackDetector.ts    # Stack analysis
│   ├── templateEngine.ts   # Template processing
│   └── propagator.ts       # Config sync engine
├── registry/         # MCP registry
├── utils/            # Utilities
└── types/            # TypeScript definitions
```

## 🤝 Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Documentation](https://docs.agentinit.dev)
- [MCP Registry](https://registry.agentinit.dev)
- [GitHub Issues](https://github.com/agentinit/agentinit/issues)

---

**AgentInit** - Unify your AI agent configurations, amplify your development workflow.
