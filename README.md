# AgentInit

> Keep your AI coding agents in sync from one `agents.md` file.

[![npm version](https://img.shields.io/npm/v/agentinit)](https://www.npmjs.com/package/agentinit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)

AgentInit is a CLI for teams and solo developers who use more than one coding agent and are tired of repeating the same setup in different formats. Define your standards once in `agents.md`, generate the files each tool expects, install shared skills and MCPs, and keep the whole setup manageable over time.

It works with Claude Code, Cursor, Windsurf, Copilot, Codex CLI, Gemini CLI, RooCode, Zed, Droid, and more.

## Why AgentInit?

Most agent setups drift fast.

You tweak `CLAUDE.md`, forget to update `.cursorrules`, install a skill in one tool but not another, and a week later every environment behaves a little differently. AgentInit gives you one source of truth for instructions, one CLI for setup, and one place to manage skills, rules, and MCP servers.

Use it when you want to:

- keep multiple agent tools aligned without manual copy-paste
- bootstrap new projects with stack-aware guidance
- install shared skills and MCP servers in a consistent way
- apply changes safely with previews, backups, and reverts
- make your agent setup easier to onboard, review, and maintain

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Stack Detection](#stack-detection)
- [MCP Registry](#mcp-registry)
- [Library API](#library-api)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- **One source of truth**: Write and maintain shared instructions in `agents.md`
- **Multi-agent sync**: Generate the right files for Claude, Cursor, Windsurf, Copilot, Codex CLI, and other supported tools
- **Stack-aware project setup**: Detect your language, framework, package manager, and test tooling to generate more useful defaults
- **Skills, plugins, and MCPs**: Install reusable capabilities from local paths, Git repositories, or marketplaces
- **Operational safety**: Preview changes, create backups, revert managed files, and track installs with a lockfile
- **Shared standards support**: Use `AGENTS.md` where supported and alias `CLAUDE.md` when you want a shared canonical rules file

## How It Works

1. Run `agentinit init` to generate an `agents.md` file for your project.
2. Customize the instructions, standards, and sub-agent roles you want all tools to follow.
3. Run `agentinit sync` or `agentinit apply` to write tool-specific files, install project-owned skills, and keep generated artifacts in sync.

If you already have agent files in a repo, start with `agentinit detect` to inspect what AgentInit can work with before you standardize it.

## Quick Start

### Installation

```bash
# Install AgentInit globally
npm install -g agentinit
```

### Basic Usage

```bash
# Initialize a shared agent configuration
agentinit init

# Review what AgentInit detects in the current repo
agentinit detect

# Sync agents.md into agent-specific files
agentinit sync

# Apply synced files, project-owned skills, and managed ignore entries
agentinit apply

# Add and verify an MCP server
agentinit mcp add --verify \
  --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything"
```

### A Typical Flow

```bash
# 1. Generate a starting point
agentinit init --template cli

# 2. Edit agents.md with your standards

# 3. Write the files each agent expects
agentinit apply

# 4. Add shared skills or MCP servers
agentinit skills add openai-docs --agent claude
agentinit mcp verify --all
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
agentinit sync --symlink      # Create CLAUDE.md -> AGENTS.md after syncing
```

`--symlink` refuses to overwrite an existing real `CLAUDE.md`; move or remove that file first if you want `AGENTS.md` to be the shared Claude alias.

### `agentinit agents-md`

Manage `AGENTS.md` directly when you want a shared file for tools that support it.

```bash
agentinit agents-md init
agentinit agents-md read
agentinit agents-md parse
agentinit agents-md set-section "Project Context" --body "Use strict TypeScript."
agentinit agents-md set-section "Testing" --file ./testing-notes.md --placement "after Project Context"
agentinit agents-md remove-section "Testing"
agentinit agents-md symlink-claude
```

Section edits preserve unrelated markdown content and operate on the selected heading subtree. `symlink-claude` creates `CLAUDE.md -> AGENTS.md` but refuses to overwrite a real `CLAUDE.md`.

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

Token counts use a lightweight estimator by default so AgentInit does not require native tokenizer dependencies. For accurate tiktoken-backed counts, install the optional tokenizer and enable accurate mode:

```bash
npm install contextcalc
agentinit config token-counting mode accurate
# or for one shell/session:
AGENTINIT_TOKEN_COUNTING_MODE=accurate agentinit mcp verify --all
```

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

Install, list, update, and remove reusable agent skills from marketplaces, local paths, or hosted Git repositories.

**Examples:**
```bash
# Inspect a source before installing
agentinit skills add owner/repo --list

# Discover a well-known skill catalog
agentinit skills discover https://example.com
agentinit skills discover https://example.com/.well-known/agent-skills/index.json

# Install a bare skill name
# Uses your configured default marketplace when one is set,
# otherwise falls back to the public catalog (`vercel-labs/agent-skills`)
agentinit skills add vercel-react-best-practices

# Install all discovered skills for detected agents using canonical storage
agentinit skills add ./skills

# Install a skill stored in a repository subdirectory
agentinit skills add owner/repo/path/to/skill
agentinit skills add gitlab:group/repo//path/to/skill
agentinit skills add bitbucket:workspace/repo/path/to/skill

# Install from GitLab or Bitbucket
agentinit skills add gitlab:group/repo
agentinit skills add bitbucket:workspace/repo

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

# Prefix installed skill names for grouping
agentinit skills add owner/repo --prefix marketing-

# Install every bundled plugin from a multi-plugin Claude bundle
agentinit skills add owner/repo --all

# Control security scanning
agentinit skills add owner/repo
agentinit skills add owner/repo --no-scan
agentinit skills add owner/repo --allow-risky

# Review and clean up installed skills
agentinit skills list
agentinit skills list --agent agents
agentinit skills update openai-docs
agentinit skills update openai-docs --everywhere
agentinit skills remove openai-docs
```

Skills are installed into a canonical store (`.agents/skills/` for project, `~/.agents/skills/` for global) with agent-specific paths symlinked automatically. Bare skill names resolve from your default marketplace or fall back to the public catalog at `vercel-labs/agent-skills`. Supports GitHub, GitLab, Bitbucket, local paths, well-known catalogs, and marketplace sources.

Well-known catalogs are JSON indexes at `/.well-known/agent-skills/index.json`, with fallback to `/.well-known/skills/index.json`. Each entry must include a `name` and a concrete skill `source`; direct index URLs are also supported.

If a GitHub or local Claude bundle contains multiple plugins, `agentinit skills add` prompts you to choose one or more bundled plugins to inspect or install. Use `--all` to skip the prompt and install or inspect every bundled plugin. In non-interactive `--yes` mode, AgentInit can also auto-resolve bundled plugins from `--skill` when those skill names map uniquely; ambiguous selections still fail with guidance.

Re-running `agentinit skills add` compares the source with the installed version and asks for confirmation before overwriting changed skills. Installs are security-scanned by default; use `--no-scan` to skip or `--allow-risky` to proceed with high-risk patterns.

`agentinit skills update [name]` replays tracked installs from their original source. Use `agentinit skills update <name> --everywhere` to update that skill across every tracked target in the global lockfile.

### `agentinit lock`

Inspect and maintain the global install lock at `~/.agentinit/lock.json`. The lock records successful skill, MCP, and rules changes so AgentInit can report current installations, find stale project paths, detect skill drift, and update tracked skills later.

**Examples:**
```bash
# List current tracked installs across projects
agentinit lock list
agentinit lock list --kind skill --agent claude

# Show a summary and optionally compare skill files with their install hashes
agentinit lock status
agentinit lock status --check-drift

# Remove entries for projects that no longer exist
agentinit lock prune --dry-run
agentinit lock prune
```

The lock is stored with user-only permissions when supported by the operating system. It can include absolute project paths, agent config paths, skill install paths, source repository or marketplace names, sanitized MCP URLs, and MCP command names. Do not share this file if those paths or source names are sensitive.

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

# Install every bundled plugin from a multi-plugin Claude bundle
agentinit plugins install owner/repo --all

# Inspect and remove installed plugins
agentinit plugins list
agentinit plugins remove code-review
```

Plugins install into `~/.claude/plugins` (for Claude-format bundles) or the canonical skill store. Built-in marketplaces include `claude` and `openai`.

If a GitHub or local Claude bundle contains multiple plugins, `agentinit plugins install` prompts you to choose which bundled plugins to inspect or install. Use `--all` to skip the prompt. In non-interactive `--yes` mode, ambiguous multi-plugin bundles still fail unless `--all` is provided.

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

# Manage the default scope used by `agentinit agent` when no scope flag is provided
agentinit config agent-settings scope
agentinit config agent-settings scope project
agentinit config agent-settings clear-scope

# Manage exact verified GitHub fallback repos
agentinit config verified-repos list
agentinit config verified-repos add acme/private-plugin
agentinit config verified-repos remove acme/private-plugin
```

Custom marketplaces use the standard AgentInit repository layout: `skills`, `mcps`, and `rules`.

Verified GitHub repos must be exact `owner/repo` entries. They only affect how AgentInit labels marketplace-to-GitHub fallback sources; they do not bypass install parsing or other safety checks.

### `agentinit agent`

Manage registry-backed native agent settings. The current implementation supports safe Claude Code, Codex CLI, and OpenCode settings, typed hook operations for agents that expose native hooks, and Claude API-key trust responses; command-executing settings such as status lines and AgentInit-managed plugin state are intentionally not exposed as raw settings.

When you omit `--global`, `--project`, and `--local`, `agentinit agent` now defaults to `global`. You can override that default with `AGENTINIT_AGENT_DEFAULT_SCOPE=global|project|local` or persist a user preference with `agentinit config agent-settings scope <scope>`. This also applies to hook commands, so pass `--project` or `--local` when supported and a hook should stay repo-scoped.
See [docs/agent-command-reference.md](docs/agent-command-reference.md) for the full command reference and examples.

**Examples:**
```bash
# Review supported agents and settings
agentinit agent list
agentinit agent list claude --details
agentinit agent schema claude --json
agentinit agent schema codex --json
agentinit agent schema opencode --json

# Set typed Claude settings
agentinit agent set claude model sonnet
agentinit agent set claude permissions.defaultMode acceptEdits --project
agentinit agent set claude env '{"AGENTINIT_TEST":"1"}' --value-json

# Set typed Codex settings
agentinit agent set codex model gpt-5.4
agentinit agent set codex model_instructions_file AGENTS.md --project

# Set typed OpenCode settings
agentinit agent set opencode model anthropic/claude-sonnet-4-5 --project
agentinit agent set opencode permission.bash ask --project
agentinit agent set opencode provider '{"local-llm":{"options":{"apiKey":"{env:LOCAL_LLM_API_KEY}"}}}' --project --value-json

# Add and inspect Claude hooks without replacing the whole hooks object
agentinit agent hook add claude after-tool-use --command "npm run lint" --matcher "Edit|Write" --name lint-after-edit
agentinit agent hook list claude post-tool-use --json
agentinit agent hook remove claude post-tool-use lint-after-edit --matcher "Edit|Write"

# Add and inspect Codex hooks
agentinit agent hook add codex pre-tool-use --command "npm run lint" --matcher "^Bash$" --project
agentinit agent hook list codex pre-tool-use --project --json

# Approve the current Claude custom API key without putting the key in shell history
agentinit agent api-key approve claude --env ANTHROPIC_API_KEY

# Read settings in human or JSON form
agentinit agent get claude model --json
agentinit agent get codex web_search --json
agentinit agent get opencode model --project --json

# Preview or remove a setting
agentinit agent set claude effortLevel high --dry-run
agentinit agent unset claude effortLevel

# Persist a different default scope if you want repo-local behavior
agentinit config agent-settings scope project

# Opt into accurate token counts when contextcalc is installed
agentinit config token-counting mode accurate
```

Use `--value-json` when the value itself is JSON. Use `--json` when the command output should be machine-readable.

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
- Write unit tests using vitest...

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
| OpenCode | `.opencode/opencode.json`, `.opencode/opencode.jsonc` | Supported |
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
import { countTokens, countTokensExact, MCPParser } from 'agentinit/utils';
```

`countTokens` is a synchronous estimate. `countTokensExact` is async and uses the optional `contextcalc` tokenizer when installed, falling back to the estimator if it is unavailable.

> **Note:** For detailed examples, type definitions, and advanced usage patterns, see the [full library documentation](src/lib/verifier/README.md).

## Development

### Building from Source

```bash
# Clone the repository
git clone <repository-url>
cd agentinit

# Install dependencies
npm ci

# Install Bun for CLI bundling if it is not already available
# https://bun.sh/docs/installation

# Build the project
npm run build

# Run locally
node dist/cli.js --help
```

### Source Structure

```
src/
├── commands/          # CLI commands
│   ├── init.ts       # Project initialization
│   ├── detect.ts     # Stack detection
│   ├── sync.ts       # Configuration sync
│   ├── mcp.ts        # MCP management
│   ├── skills.ts     # Skill installation and updates
│   └── lock.ts       # Global install lock inspection
├── core/             # Core functionality
│   ├── agentDetector.ts    # Agent detection
│   ├── stackDetector.ts    # Stack analysis
│   ├── installLock.ts      # Global install lock state
│   ├── templateEngine.ts   # Template processing
│   └── propagator.ts       # Config sync engine
├── utils/            # Utilities
└── types/            # TypeScript definitions
```

## Contributing

Issues and pull requests are welcome. Open an issue if you want to discuss a new agent, marketplace behavior, or MCP workflow before making a larger change.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- [GitHub Issues](https://github.com/agentinit/agentinit/issues)
