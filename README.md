# AgentInit

> A CLI tool for managing and configuring AI coding agents

AgentInit transforms AI agent configuration from a fragmented, manual process into a unified, automated workflow that ensures every developer gets consistent, context-aware AI assistance tailored to their project's specific needs.

## ✨ Features

- **🤖 Universal Agent Configuration**: Unified `agents.md` file that syncs with all major AI coding agents
- **🔍 Smart Stack Detection**: Automatically detects project language, framework, and tools
- **🔄 Bidirectional Sync**: Keep agent configurations in sync across Claude, Cursor, Windsurf, and more
- **📦 MCP Management**: Configure, inspect, and verify Model Context Protocol servers
- **📋 Rules Templates**: Apply coding best practices with predefined rule templates (Git, testing, docs, linting)
- **🔌 Plugin Marketplace**: Install portable skills and MCP bundles from explicit marketplace sources
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

# Apply project-owned agent files, skills, and ignore management
agentinit apply

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
agentinit sync --agent claude cursor
agentinit sync --dry-run      # Preview changes
agentinit sync --backup       # Create backups
```

### `agentinit apply`

Apply `agents.md` plus project-owned skills to supported agent files, and manage ignore entries for generated files.

```bash
agentinit apply                        # Sync + project skills + managed ignore block
agentinit apply --agent claude cursor  # Target specific agents
agentinit apply --dry-run              # Preview changes
agentinit apply --backup               # Create sibling .agentinit.backup files
agentinit apply --copy-skills          # Copy project skills instead of using canonical symlink installs
agentinit apply --no-skills            # Skip project-owned skills
agentinit apply --gitignore-local      # Write ignore entries to .git/info/exclude
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

Install, list, and remove reusable agent skills from marketplaces, local paths, or GitHub repositories.

**Examples:**
```bash
# Inspect a source before installing
agentinit skills add owner/repo --list

# Install a public skill from the default catalog (`vercel-labs/agent-skills`)
agentinit skills add vercel-react-best-practices

# Install all discovered skills for detected agents using canonical storage
agentinit skills add ./skills

# Install marketplace-hosted skills explicitly
agentinit skills add claude/skill-creator
agentinit skills add skill-creator --from claude
agentinit skills add openai/gh-address-comments

# Repo-shaped marketplace misses warn and fall back to GitHub
agentinit skills add openai/codex-plugin-cc

# Install selected skills globally for a specific agent
agentinit skills add owner/repo --global --agent claude --skill openai-docs

# Force copied installs instead of canonical symlink installs
agentinit skills add ./skills --copy

# Review and clean up installed skills
agentinit skills list
agentinit skills remove openai-docs
```

If you run `skills add` without `--agent` or `--yes`, AgentInit prompts for install scope first (`project` or `global`), then prompts for the agent skill directories to target. If no project agent files are detected, it still lets you choose project agent directories manually and points you to `agentinit init` for future auto-detection.

Skills are installed into a canonical store by default: project installs use `.agents/skills/`, and global installs use `~/.agents/skills/`. Agent-specific paths are symlinked to that store when they differ. Use `--copy` or `--copy-skills` to force independent copies instead.

Some agents share the same native skills directory. For example, Claude Code and Claude Desktop both use `~/.claude/skills/`, so `skills remove --agent ...` will skip deleting that shared path while another agent still depends on it.

Bare skill names default to the public skills catalog used by the open agent skills ecosystem: `vercel-labs/agent-skills`. Use `./name` for a local path, `owner/repo` for an explicit GitHub repository, or `--from <marketplace>` / `<marketplace>/<name>` for marketplace-backed sources.

Marketplace-backed `skills add` installs only the discovered skills. If a marketplace source also contains MCP servers or other portable components, AgentInit warns and points you to `agentinit plugins install ...` for the full install.

If a marketplace lookup misses and the source still looks like a GitHub repository, AgentInit warns and tries the matching GitHub repo directly as an unverified fallback. This covers repos like `openai/codex-plugin-cc` that are not part of the curated OpenAI skills catalog.

### `agentinit plugins`

Install, inspect, search, and remove portable plugins from explicit marketplace sources, GitHub repositories, or local paths.

**Examples:**
```bash
# Search a marketplace explicitly
agentinit plugins search --from claude
agentinit plugins search code-review --from claude

# Install from a marketplace explicitly
agentinit plugins install claude/code-review
agentinit plugins install code-review --from claude
agentinit plugins install openai/codex-plugin-cc

# Install from GitHub or a local path
agentinit plugins install owner/repo
agentinit plugins install ./plugins/code-review
agentinit plugins install ./plugins/code-review --copy-skills

# Inspect and remove installed plugins
agentinit plugins list
agentinit plugins remove code-review
```

**Marketplace Rules:**
- Marketplace installs are explicit by design. Bare names like `agentinit plugins install code-review` are rejected.
- Use `<marketplace>/<plugin>` or `--from <marketplace>` when installing from a marketplace.
- `plugins search` also requires `--from <marketplace>`.
- Implemented marketplaces today include `claude` (Anthropic's Claude plugin marketplace) and `openai` (the OpenAI Codex skills catalog).
- If a marketplace lookup misses but the source still looks like `owner/repo`, AgentInit warns and tries that GitHub repository directly.
- For Claude-format plugins, `plugins install` still installs portable skills and MCP servers for the selected agents. If Claude Code-native components are also present, AgentInit previews that compatibility before target selection. The native plugin payload installs only when `claude` is one of the selected targets; otherwise AgentInit warns that the Claude-only parts were skipped. When the native payload is installed, AgentInit reminds you to run `/reload-plugins`.
- Claude-native plugin payloads are user-scoped and stored under `~/.claude/plugins`, even when the AgentInit install itself is project-scoped.

### `agentinit revert`

Revert files and backups managed by `agentinit apply` or `agentinit sync`.

```bash
agentinit revert             # Restore backups and remove generated files
agentinit revert --dry-run   # Preview what would be reverted
agentinit revert --keep-backups
```

### Compatibility

`agentinit apply` is now the project-level orchestration command for sync, project skills, and managed ignore state.
Legacy `agentinit apply --mcp-*`, `--rules`, and related flags still work for backward compatibility, and `agentinit verify_mcp` remains deprecated in favor of `agentinit mcp verify`.

## 🏗️ Project Structure

AgentInit creates and manages these key files:

```
your-project/
├── agents.md                 # Universal agent configuration
├── CLAUDE.md                 # Claude-specific config (synced)
├── .cursorrules              # Cursor-specific config (synced)
├── AGENTS.md                 # Shared AGENTS.md standard for supporting agents
├── .agents/skills/           # Canonical project skill storage
├── .claude/skills/           # Claude skill view (often symlinks into .agents/skills)
├── .windsurfrules            # Windsurf-specific config (synced)
└── .agentinit/               # Managed state and internal backups
```

## 📖 Configuration

### agents.md Structure

The `agents.md` file is the single source of truth for all agent configurations:

```markdown
---
rules_alias: agents # optional: make AGENTS.md canonical and symlink CLAUDE.md to it
---
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

`AGENTS.md` is a shared standard used by multiple tools, so AgentInit does not use it by itself as an auto-detection signal.

When `rules_alias: agents` is set in `agents.md` frontmatter, AgentInit writes shared rules to `AGENTS.md` and makes `CLAUDE.md` a symlinked alias when Claude is targeted. If symlink creation fails, AgentInit falls back to writing a copied `CLAUDE.md`.

| Agent | Config File | Status |
|-------|-------------|--------|
| Claude | `CLAUDE.md` | ✅ |
| Claude Desktop | global desktop config | ✅ |
| Cursor | `.cursorrules` | ✅ |
| Windsurf | `.windsurfrules` | ✅ |
| GitHub Copilot | `AGENTS.md`, `.vscode/mcp.json` | ✅ |
| Aider | `AGENTS.md`, `.aider.conf.yml` | ✅ |
| Cline | `.clinerules` | ✅ |
| Codex CLI | `.codex/config.toml` | ✅ |
| Gemini CLI | `.gemini/settings.json` | ✅ |
| RooCode | `AGENTS.md`, `.roo/mcp.json` | ✅ |
| Zed | `AGENTS.md`, `.zed/settings.json` | ✅ |
| Droid | `AGENTS.md`, `.factory/mcp.json` | ✅ |
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
