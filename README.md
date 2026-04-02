# AgentInit

> A CLI tool for managing and configuring AI coding agents

Unified CLI for configuring AI coding agents across editors and tools.

## Features

- **Universal Agent Configuration**: Unified `agents.md` file that syncs with all major AI coding agents
- **Smart Stack Detection**: Automatically detects project language, framework, and tools
- **Bidirectional Sync**: Keep agent configurations in sync across Claude, Cursor, Windsurf, and more
- **MCP Management**: Configure, inspect, and verify Model Context Protocol servers
- **Rules Templates**: Apply coding best practices with predefined rule templates (Git, testing, docs, linting)
- **Plugin Marketplace**: Install portable skills and MCP bundles from built-in or custom marketplaces
- **Project Templates**: Pre-built templates for web apps, CLI tools, libraries, and more
- **Stack-Aware Guidance**: Customized instructions based on your technology stack

## Quick Start

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

### Output Controls

```bash
# Disable ANSI colors for CI, logs, or plain-text output
NO_COLOR=1 agentinit plugins list
```

## Commands

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

# Install a bare skill name
# Uses your configured default marketplace when one is set,
# otherwise falls back to the public catalog (`vercel-labs/agent-skills`)
agentinit skills add vercel-react-best-practices

# Install all discovered skills for detected agents using canonical storage
agentinit skills add ./skills

# Install a skill stored in a repository subdirectory
agentinit skills add owner/repo/path/to/skill

# Install marketplace-hosted skills explicitly
agentinit skills add claude/skill-creator
agentinit skills add skill-creator --from claude
agentinit skills add openai/gh-address-comments

# Repo-shaped marketplace misses warn and fall back to GitHub
agentinit skills add openai/codex-plugin-cc

# Install selected skills globally for a specific agent
agentinit skills add owner/repo --global --agent claude --skill openai-docs
agentinit skills add owner/repo --global --agent openclaw
agentinit skills add owner/repo --global --agent hermes

# Install directly into the shared AGENTS.md canonical store
agentinit skills add owner/repo --global --agent agents

# Force copied installs instead of canonical symlink installs
agentinit skills add ./skills --copy

# Review and clean up installed skills
agentinit skills list
agentinit skills list --agent agents
agentinit skills remove openai-docs
```

If a GitHub or local Claude bundle contains multiple plugins, `agentinit skills add` prompts you to choose which bundled plugin to inspect or install. In non-interactive `--yes` mode, ambiguous multi-plugin bundles fail instead of prompting.

Skills are installed into a canonical store by default (`.agents/skills/` for project, `~/.agents/skills/` for global), with agent-specific paths symlinked automatically. Bare skill names resolve from your configured default marketplace, falling back to the public catalog at `vercel-labs/agent-skills`. Use `./name` for local paths, `owner/repo` for GitHub repos, or `--from <marketplace>` for explicit marketplace sources.

### `agentinit plugins`

Install, inspect, search, and remove portable plugins from explicit marketplace sources, GitHub repositories, or local paths.

**Examples:**
```bash
# Search a marketplace explicitly
agentinit plugins search --from claude
agentinit plugins search code-review --from claude

# Search through your configured default marketplace
agentinit plugins search code-review

# Install from a marketplace explicitly
agentinit plugins install claude/code-review
agentinit plugins install code-review --from claude

# Bare plugin names resolve through your configured default marketplace
# when one is set, otherwise through the first available marketplace
agentinit plugins install code-review
agentinit plugins install openai/codex-plugin-cc

# Install from GitHub or a local path
agentinit plugins install owner/repo
agentinit plugins install ./plugins/code-review
agentinit plugins install ./plugins/code-review --copy-skills

# Inspect and remove installed plugins
agentinit plugins list
agentinit plugins remove code-review
```

Bare plugin names resolve through your configured default marketplace. Built-in marketplaces include `claude` and `openai`; add custom ones with `agentinit config marketplaces add`. For Claude-format plugins, native bundles are installed into `~/.claude/plugins` alongside portable skill and MCP installs.

If a GitHub or local Claude bundle contains multiple plugins, `agentinit plugins install` prompts you to choose which bundled plugin to inspect or install. In non-interactive `--yes` mode, ambiguous multi-plugin bundles fail instead of prompting.

### `agentinit config`

Manage user-level marketplace and trust settings in `~/.agentinit/config.json`.

**Examples:**
```bash
# Review built-in and custom marketplaces
agentinit config marketplaces list

# Add a custom marketplace and make it the default
agentinit config marketplaces add acme https://github.com/acme/marketplace.git --name "Acme Marketplace" --default

# Switch the default marketplace to a built-in registry
agentinit config marketplaces default claude
agentinit config marketplaces clear-default

# Manage exact verified GitHub fallback repos
agentinit config verified-repos list
agentinit config verified-repos add acme/private-plugin
agentinit config verified-repos remove acme/private-plugin
```

Custom marketplaces use the standard AgentInit repository layout: `skills`, `mcps`, and `rules`.

Verified GitHub repos must be exact `owner/repo` entries. They only affect how AgentInit labels marketplace-to-GitHub fallback sources; they do not bypass install parsing or other safety checks.

### `agentinit revert`

Revert files and backups managed by `agentinit apply` or `agentinit sync`.

```bash
agentinit revert             # Restore backups and remove generated files
agentinit revert --dry-run   # Preview what would be reverted
agentinit revert --keep-backups
```

## Project Structure

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

## Configuration

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

Supported agents today are Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot, Aider, Cline, OpenAI Codex CLI, Google Gemini CLI, OpenClaw, Hermes, RooCode, Zed, and Droid. Codeium remains partial/in progress.

| Agent | Config File | Status |
|-------|-------------|--------|
| Claude | `CLAUDE.md` | Supported |
| Claude Desktop | global desktop config | Supported |
| Cursor | `.cursorrules` | Supported |
| Windsurf | `.windsurfrules` | Supported |
| GitHub Copilot | `AGENTS.md`, `.vscode/mcp.json` | Supported |
| Aider | `AGENTS.md`, `.aider.conf.yml` | Supported |
| Cline | `.clinerules` | Supported |
| Codex CLI | `.codex/config.toml` | Supported |
| Gemini CLI | `.gemini/settings.json` | Supported |
| OpenClaw | `~/.openclaw` presence, `~/.openclaw/skills/` | Supported (skills) |
| Hermes | `~/.hermes` presence, `~/.hermes/skills/` | Supported (skills) |
| RooCode | `AGENTS.md`, `.roo/mcp.json` | Supported |
| Zed | `AGENTS.md`, `.zed/settings.json` | Supported |
| Droid | `AGENTS.md`, `.factory/mcp.json` | Supported |
| Codeium | `.codeium/config.json` | Partial |

## Stack Detection

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

## MCP Registry

AgentInit includes a curated registry of popular MCPs:

| MCP | Category | Description |
|-----|----------|-------------|
| playwright | testing | E2E testing and browser automation |
| context7 | documentation | Fetch and analyze documentation |
| sequential-thinking | quality | Enhanced AI reasoning |
| agent-warden | quality | Prevent common AI mistakes |
| supabase-mcp | database | Supabase integration |
| git-mcp | version-control | Enhanced Git operations |

## Library API

AgentInit can be used as a library in your Node.js/TypeScript applications for programmatic MCP server verification and management.

> **Full Documentation:** See [src/lib/verifier/README.md](src/lib/verifier/README.md) for complete API reference, examples, and advanced usage.

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
  console.log(`Connected to ${result.server.name}`);
  console.log(`Tools: ${result.capabilities?.tools.length}`);
  console.log(`Total tokens: ${result.capabilities?.totalToolTokens}`);
}
```

### Submodule Imports

For better tree-shaking, import from specific submodules:

```typescript
import { MCPVerifier } from 'agentinit/verifier';
import { MCPServerType } from 'agentinit/types';
import type {
  MCPServerConfig,
  MCPVerificationResult,
  MCPVerificationOptions
} from 'agentinit/types';
import { countTokens, MCPParser } from 'agentinit/utils';
```

> **Note:** For detailed examples, type definitions, and advanced usage patterns, see the [full library documentation](src/lib/verifier/README.md).

## Development

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

## Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- [Documentation](https://docs.agentinit.dev)
- [MCP Registry](https://registry.agentinit.dev)
- [GitHub Issues](https://github.com/agentinit/agentinit/issues)
