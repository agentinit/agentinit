# AgentInit

> One `agents.md`. All your AI agents. Zero drift.

[![npm](https://img.shields.io/npm/v/agentinit)](https://www.npmjs.com/package/agentinit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)
[![Discord](https://img.shields.io/discord/1360000000000000000?label=discord&logo=discord&color=7289da)](https://discord.gg/agentinit)

Stop copy-pasting `CLAUDE.md` → `.cursorrules` → `.windsurfrules` → `.codex/config.toml` every time you tweak a rule. Write your standards **once**, propagate them to **15+ agent tools**, and stop playing whack-a-mole with config drift.

Works with Claude Code, Cursor, Windsurf, Copilot, Codex CLI, Gemini CLI, RooCode, Zed, Droid, Hermes, OpenClaw, and more.

[asciinema: coming soon — `agentinit init` → edit → `agentinit apply` under 30s]

---

## The 30-Second Pitch

| Before AgentInit | After AgentInit |
|---|---|
| 5 config files, manually synced | 1 `agents.md` |
| Rules drift in 2 days | `agentinit apply` syncs everything |
| Skills installed per tool | Central skill store, auto-linked |
| No MCP verification | `agentinit mcp verify --all` checks health |
| New teammate → 20 min setup | New teammate → `git pull` → `agentinit apply` |

---

## Quick Start

```bash
# 1. Install
npm install -g agentinit

# 2. Generate your agents.md
agentinit init --template cli

# 3. Sync to all detected agents
agentinit apply
```

Done. Claude gets `CLAUDE.md`. Cursor gets `.cursorrules`. Windsurf gets `.windsurfrules`. From **one file**.

See the [full docs](https://github.com/agentinit/agentinit/tree/main/docs) for advanced usage: agent-specific settings, MCP management, hooks, skill marketplaces, and the programmatic API.

---

## Why AgentInit?

- **One source of truth** — `agents.md` drives every agent's behavior
- **Drift-proof** — lockfile tracks what was installed where; `--dry-run` previews every change
- **Stack-aware** — auto-detects TypeScript, Python, Go, Rust, etc. and generates sane defaults
- **Skill ecosystem** — install from GitHub, GitLab, Bitbucket, or curated marketplaces
- **MCP at scale** — add, verify, and manage Model Context Protocol servers across all agents
- **Safe by design** — backups before writes, `--dry-run`, revert, security-scan on skill install

---

## Supported Agents

| Agent | File | Status |
|---|---|---|
| Claude Code | `CLAUDE.md` | ✅ Full |
| Claude Desktop | global config | ✅ Full |
| Cursor | `.cursorrules` | ✅ Full |
| Windsurf | `.windsurfrules` | ✅ Full |
| GitHub Copilot | `AGENTS.md`, `.vscode/mcp.json` | ✅ Full |
| Aider | `AGENTS.md`, `.aider.conf.yml` | ✅ Full |
| Cline | `.clinerules` | ✅ Full |
| Codex CLI | `.codex/config.toml` | ✅ Full |
| Gemini CLI | `.gemini/settings.json` | ✅ Full |
| RooCode | `AGENTS.md`, `.roo/mcp.json` | ✅ Full |
| Zed | `AGENTS.md`, `.zed/settings.json` | ✅ Full |
| Droid | `AGENTS.md`, `.factory/mcp.json` | ✅ Full |
| Hermes | `~/.hermes/skills/` | ✅ Skills |
| OpenClaw | `~/.openclaw/skills/` | ✅ Skills |
| Codeium | `.codeium/config.json` | 🚧 Partial |

**15 agents and counting.** Want one added? [Open an issue](https://github.com/agentinit/agentinit/issues/new).

---

## What You Get

```
my-project/
├── agents.md              # ← you write this
├── CLAUDE.md              # ← auto-generated (or symlinked)
├── .cursorrules           # ← auto-generated
├── .windsurfrules        # ← auto-generated
├── .agents/skills/       # ← canonical skill store
├── .agentinit/           # ← lockfile + backups
└── (whatever else your agents expect)
```

---

## Talk to Us

- ⭐ **Star the repo** if this saves you time
- 🐛 [Open an issue](https://github.com/agentinit/agentinit/issues) for bugs or agent requests
- 💬 [Join Discord](https://discord.gg/agentinit) for support and feature discussions

---

## License

MIT — see [LICENSE](LICENSE).

Built with `bun`, tested with `vitest`, released with `semantic-release`.
