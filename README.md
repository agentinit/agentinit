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

# Install MCPs interactively
agentinit mcp --interactive
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

Manage Model Context Protocol installations.

```bash
agentinit mcp                      # Show top MCPs
agentinit mcp --interactive        # Interactive selection
agentinit mcp --search <query>     # Search MCPs
agentinit mcp --install <name>     # Install specific MCP
```

### `agentinit verify_mcp`

Verify MCP server installations and get their tools with token usage.

**Examples:**
```bash
# Verify all MCPs in project
agentinit verify_mcp --all
# Verify STDIO server
agentinit verify_mcp --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything"
# Verify HTTP server
agentinit verify_mcp --mcp-http notion_api "https://mcp.notion.com/mcp"  --timeout 30000
```

Shows connection status, response time, and available tools/resources/prompts for each MCP server.

### `agentinit apply`

Apply configurations including MCP server setup.

#### MCP Configuration


```bash
# Configure STDIO MCP with everything server (recommended example)
npx agentinit apply \
  --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything"

# Configure multiple MCPs in one command
npx agentinit apply \
  --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything" \
  --mcp-stdio supabase "npx -y @supabase/mcp-server-supabase@latest" \
    --args "--read-only --project-ref=<project-ref>" \
    --env "SUPABASE_ACCESS_TOKEN=<personal-access-token>" \
  --mcp-http notion_api "https://mcp.notion.com/mcp" \
  --mcp-sse notion_events "https://mcp.notion.com/sse"

# Configure HTTP MCP with authentication
npx agentinit apply \
  --mcp-http github "https://api.githubcopilot.com/mcp/" --auth "Bearer YOUR_GITHUB_PAT"

# Configure HTTP MCP with custom headers
npx agentinit apply \
  --mcp-http context7 "https://mcp.context7.com/mcp" \
  --header "CONTEXT7_API_KEY:YOUR_API_KEY"

# Multiple custom headers
npx agentinit apply \
  --mcp-http api_server "https://api.example.com/mcp" \
  --header "X-API-Key:YOUR_API_KEY" \
  --header "X-Client-ID:YOUR_CLIENT_ID"

# Combine Bearer auth with custom headers
npx agentinit apply \
  --mcp-http advanced_api "https://api.example.com/mcp" \
  --auth "Bearer YOUR_TOKEN" \
  --header "X-Custom-Header:custom_value"

# Configure Docker-based MCP with environment
npx agentinit apply \
  --mcp-stdio browserbase "docker run -i --rm ghcr.io/metorial/mcp-container--browserbase--mcp-server-browserbase--browserbase node cli.js" \
  --env "BROWSERBASE_API_KEY=browserbase-api-key"

# Global configuration with custom headers
npx agentinit apply --global --client claude \
  --mcp-http context7 "https://mcp.context7.com/mcp" \
  --header "CONTEXT7_API_KEY:YOUR_API_KEY"

# Verify MCPs immediately after configuration
npx agentinit apply --verify-mcp \
  --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything"
```

This generates `.agentinit/agentinit.toml` with your MCP configurations.

**MCP Authentication Options**:
- `--auth "Bearer TOKEN"` - Adds Authorization header for Bearer token authentication
- `--header "KEY:VALUE"` - Adds custom headers in KEY:VALUE format (can be used multiple times)
- Both flags can be combined for APIs requiring multiple authentication methods

**MCP Verification**: Use the `--verify-mcp` flag to test MCP servers immediately after configuration. This ensures servers are reachable and shows their available tools, resources, and prompts. Use `--timeout <ms>` to set a custom connection timeout (default: 30000ms).

```bash
# Verify with custom timeout
npx agentinit apply --verify-mcp --timeout 30000 \
  --mcp-stdio chrome-mcp "bunx -y chrome-devtools-mcp@latest"
```

#### Rules Configuration

Apply coding rules and best practices to your AI agents using predefined templates or custom rules.

```bash
# Apply rule templates (recommended combinations)
agentinit apply --rules git,write_tests,use_linter

# Mix templates with custom rules
agentinit apply --rules git,write_docs --rule-raw "Use TypeScript strict mode"

# Load rules from a file
agentinit apply --rules-file ./project-rules.md

# Apply globally to all projects using Claude
agentinit apply --global --agent claude --rules git,write_tests

# Combine with MCP configuration
agentinit apply --rules git,use_linter --mcp-stdio context7 "npx @context7/mcp"
```

**Available Rule Templates:**
- `git` - Enforce Git workflows and commit standards
- `write_docs` - Require comprehensive documentation
- `use_git_worktrees` - Enable parallel development with worktrees  
- `use_subagents` - Delegate work to specialized subagents
- `use_linter` - Enforce code quality and formatting
- `write_tests` - Implement test-driven development practices

**Token Tracking:** The apply command automatically tracks and displays token usage with color-coded output (🟢 Green ≤5k, 🟡 Yellow 5k-15k, 🔴 Red >15k) and git-style diffs to help manage AI context size. Example: `Rules: 101 tokens (-296)` shows rule tokens with change tracking.

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
import { MCPVerifier, MCPServerType } from 'agentinit';

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

### Submodule Imports

For better tree-shaking, import from specific submodules:

```typescript
// Import specific modules
import { MCPVerifier } from 'agentinit/verifier';
import { MCPServerType } from 'agentinit/types';
import type { MCPServerConfig, MCPVerificationResult } from 'agentinit/types';
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
import { MCPVerifier, MCPServerType } from 'agentinit';

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
- `verifyServer(config: MCPServerConfig, timeout?: number): Promise<MCPVerificationResult>` - Verify a single MCP server
- `verifyServers(configs: MCPServerConfig[], timeout?: number): Promise<MCPVerificationResult[]>` - Verify multiple servers in parallel
- `formatResults(results: MCPVerificationResult[]): string` - Format verification results for display

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
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
  serverInfo?: {
    name: string;
    version: string;
  };
  totalToolTokens?: number;
  toolTokenCounts?: Map<string, number>;
}
```

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