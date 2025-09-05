# AgentInit MCP Testing Commands

This document provides comprehensive test commands for adding MCP servers to different AI coding agents using the AgentInit tool.

## Prerequisites

Before running these tests:
1. Build the project: `npm run build`
2. Ensure you have the necessary API keys for the MCP servers
3. Create appropriate agent configuration files where needed

## Test Categories

- [Basic MCP Server Types](#basic-mcp-server-types)
- [Agent-Specific Tests](#agent-specific-tests)
- [Global Configuration Tests](#global-configuration-tests)
- [Complex Multi-MCP Tests](#complex-multi-mcp-tests)
- [Error Handling Tests](#error-handling-tests)
- [Real-World MCP Examples](#real-world-mcp-examples)

---

## Basic MCP Server Types

### STDIO MCP Servers

```bash
# Basic filesystem MCP server
node dist/index.js apply --agent claude \
  --mcp-stdio filesystem "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/$(whoami)/Documents"

# MCP server with environment variables
node dist/index.js apply --agent claude \
  --mcp-stdio supabase "npx -y @supabase/mcp-server-supabase" \
  --args "--read-only --project-ref=your-project-ref" \
  --env "SUPABASE_ACCESS_TOKEN=your-token"

# Multiple arguments example
node dist/index.js apply --agent claude \
  --mcp-stdio postgres "npx -y @postgres/mcp-server" \
  --args "--host localhost --port 5432 --database mydb" \
  --env "POSTGRES_PASSWORD=secret DATABASE_URL=postgres://localhost/mydb"
```

### HTTP MCP Servers

```bash
# Basic HTTP MCP server
node dist/index.js apply --agent claude \
  --mcp-http github "https://api.github.com/mcp" \
  --auth "Bearer ghp_your_github_token"

# HTTP server with custom headers
node dist/index.js apply --agent claude \
  --mcp-http notion "https://api.notion.com/mcp"
```

### SSE MCP Servers

```bash
# Basic SSE MCP server
node dist/index.js apply --agent claude \
  --mcp-sse realtime "https://api.example.com/mcp/sse"

# SSE server with authentication
node dist/index.js apply --agent claude \
  --mcp-sse context7 "https://mcp.context7.com/sse" \
  --auth "Bearer ctx7sk-your-api-key"
```

---

## Agent-Specific Tests

### Claude Code Tests

```bash
# Project-level configuration (.mcp.json)
node dist/index.js apply --agent claude \
  --mcp-stdio exa "npx -y @exa/mcp-server" \
  --env "EXA_API_KEY=your-exa-key" \
  --mcp-http anthropic-tools "https://tools.anthropic.com/mcp"

# Global configuration (~/.claude.json)
node dist/index.js apply --global --agent claude \
  --mcp-stdio global-fs "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/$(whoami)/shared-docs" \
  --mcp-sse global-realtime "https://global.example.com/sse"
```

### Cursor IDE Tests

```bash
# Cursor project configuration (.cursor/mcp.json)
node dist/index.js apply --agent cursor \
  --mcp-stdio cursor-fs "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/workspace/projects" \
  --mcp-http cursor-api "https://cursor-tools.com/mcp"

# Multiple MCP servers for Cursor
node dist/index.js apply --agent cursor \
  --mcp-stdio git-tools "npx -y @git/mcp-server" \
  --mcp-http code-review "https://api.codereview.com/mcp" \
  --auth "Bearer cursor_token_123" \
  --mcp-sse live-collab "https://collab.cursor.com/sse"
```

### Codex CLI Tests

```bash
# Codex only supports STDIO, so remote servers are transformed
node dist/index.js apply --agent codex \
  --mcp-stdio local-tools "npx -y @codex/local-tools" \
  --mcp-http remote-api "https://api.example.com/mcp"  # Will be transformed to stdio via mcp-remote

# Complex Codex configuration
node dist/index.js apply --agent codex \
  --mcp-stdio database "python -m codex_db_tools" \
  --args "--connection-string postgresql://localhost/codex" \
  --env "DB_PASSWORD=secret LOG_LEVEL=debug"
```

### Gemini CLI Tests

```bash
# Gemini configuration (.gemini/settings.json)
node dist/index.js apply --agent gemini \
  --mcp-stdio gemini-fs "npx -y @google/filesystem-mcp" \
  --args "/home/user/workspace" \
  --mcp-http google-tools "https://tools.googleapis.com/mcp" \
  --auth "Bearer ya29.your_google_token"
```

### Claude Desktop Tests

```bash
# Claude Desktop only supports global configuration
node dist/index.js apply --global --agent claude-desktop \
  --mcp-stdio desktop-fs "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/$(whoami)/Desktop" \
  --mcp-http claude-tools "https://desktop.anthropic.com/mcp"
```

---

## Global Configuration Tests

### Cross-Agent Global Setup

```bash
# Set up global MCP servers for Claude Code
node dist/index.js apply --global --agent claude \
  --mcp-stdio global-git "npx -y @git/mcp-server" \
  --args "--repo-path /Users/$(whoami)/git" \
  --mcp-http global-ai-tools "https://ai-tools.com/mcp" \
  --auth "Bearer global_token_123"

# Set up global MCP servers for Cursor
node dist/index.js apply --global --agent cursor \
  --mcp-stdio shared-workspace "npx -y @workspace/mcp-tools" \
  --env "WORKSPACE_ROOT=/shared/workspace"
```

### Global vs Project Configuration

```bash
# Add to global first
node dist/index.js apply --global --agent claude \
  --mcp-stdio global-utils "npx -y @utils/mcp-server"

# Then add project-specific
node dist/index.js apply --agent claude \
  --mcp-stdio project-specific "npx -y @project/mcp-tools" \
  --args "--project-root ."
```

---

## Complex Multi-MCP Tests

### Full Development Stack

```bash
# Complete development environment
node dist/index.js apply --agent claude \
  --mcp-stdio filesystem "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/$(whoami)/projects" \
  --mcp-stdio git "npx -y @git/mcp-server" \
  --args "--auto-commit false" \
  --mcp-http github "https://api.github.com/mcp" \
  --auth "Bearer ghp_your_token" \
  --mcp-stdio database "npx -y @database/mcp-tools" \
  --env "DATABASE_URL=postgres://localhost/devdb" \
  --mcp-sse notifications "https://notify.example.com/sse" \
  --auth "Bearer notify_token"
```

### Data Science Stack

```bash
# Data science workflow
node dist/index.js apply --agent claude \
  --mcp-stdio jupyter "npx -y @jupyter/mcp-server" \
  --args "--notebook-dir /Users/$(whoami)/notebooks" \
  --mcp-http datasets "https://api.datasets.com/mcp" \
  --auth "Bearer dataset_key_123" \
  --mcp-stdio python-env "python -m datascience_mcp" \
  --env "PYTHON_PATH=/opt/miniconda3/envs/ds/bin/python"
```

### Web Development Stack

```bash
# Full-stack web development
node dist/index.js apply --agent cursor \
  --mcp-stdio npm-tools "npx -y @npm/mcp-server" \
  --mcp-stdio tailwind "npx -y @tailwindcss/mcp-server" \
  --mcp-http vercel "https://api.vercel.com/mcp" \
  --auth "Bearer vercel_token" \
  --mcp-http supabase-api "https://api.supabase.com/mcp" \
  --auth "Bearer supabase_key" \
  --mcp-sse hot-reload "https://dev-server.local/sse"
```

---

## Error Handling Tests

### Invalid Configurations

```bash
# Test missing server name (should fail)
node dist/index.js apply --agent claude --mcp-stdio

# Test invalid agent (should fail)  
node dist/index.js apply --agent invalid-agent \
  --mcp-stdio test "npx -y test"

# Test global without agent specified (should fail)
node dist/index.js apply --global \
  --mcp-stdio test "npx -y test"
```

### Agent Detection Tests

```bash
# Test in directory without agent files (should warn)
cd /tmp && node /path/to/agentinit/dist/index.js apply \
  --mcp-stdio test "npx -y test"

# Test with specific agent in non-agent directory
cd /tmp && node /path/to/agentinit/dist/index.js apply --agent claude \
  --mcp-stdio test "npx -y test"
```

---

## Real-World MCP Examples

### AI/ML Development

```bash
# Ollama local AI models
node dist/index.js apply --agent claude \
  --mcp-stdio ollama "npx -y @ollama/mcp-server" \
  --args "--model-path /Users/$(whoami)/.ollama/models"

# Weights & Biases integration
node dist/index.js apply --agent claude \
  --mcp-http wandb "https://api.wandb.ai/mcp" \
  --auth "Bearer your_wandb_key"

# Hugging Face models
node dist/index.js apply --agent claude \
  --mcp-http huggingface "https://huggingface.co/api/mcp" \
  --auth "Bearer hf_your_token"
```

### Development Tools

```bash
# Docker integration
node dist/index.js apply --agent cursor \
  --mcp-stdio docker "npx -y @docker/mcp-server" \
  --env "DOCKER_HOST=unix:///var/run/docker.sock"

# Kubernetes tools
node dist/index.js apply --agent claude \
  --mcp-stdio kubectl "npx -y @k8s/mcp-server" \
  --args "--kubeconfig /Users/$(whoami)/.kube/config"

# AWS integration
node dist/index.js apply --agent claude \
  --mcp-stdio aws "npx -y @aws/mcp-server" \
  --env "AWS_PROFILE=default AWS_REGION=us-west-2"
```

### Database Integrations

```bash
# PostgreSQL
node dist/index.js apply --agent claude \
  --mcp-stdio postgres "npx -y @postgres/mcp-server" \
  --env "DATABASE_URL=postgresql://user:pass@localhost:5432/mydb"

# MongoDB
node dist/index.js apply --agent claude \
  --mcp-stdio mongodb "npx -y @mongodb/mcp-server" \
  --env "MONGO_URI=mongodb://localhost:27017/myapp"

# Redis
node dist/index.js apply --agent claude \
  --mcp-stdio redis "npx -y @redis/mcp-server" \
  --env "REDIS_URL=redis://localhost:6379"
```

### Content Management

```bash
# Notion integration
node dist/index.js apply --agent claude \
  --mcp-http notion "https://api.notion.com/mcp" \
  --auth "Bearer notion_integration_token"

# Airtable
node dist/index.js apply --agent claude \
  --mcp-http airtable "https://api.airtable.com/mcp" \
  --auth "Bearer airtable_pat"

# Confluence
node dist/index.js apply --agent claude \
  --mcp-http confluence "https://your-domain.atlassian.net/wiki/api/mcp" \
  --auth "Bearer confluence_token"
```

### Communication Tools

```bash
# Slack integration
node dist/index.js apply --agent claude \
  --mcp-http slack "https://slack.com/api/mcp" \
  --auth "Bearer xoxb-your-slack-token"

# Discord bot
node dist/index.js apply --agent claude \
  --mcp-sse discord "https://discord.com/api/mcp/sse" \
  --auth "Bot your_discord_token"
```

---

## Validation Commands

After adding MCP servers, use these commands to verify the configurations:

### Check Generated Files

```bash
# Check project-level configurations
ls -la .mcp.json .cursor/mcp.json .codex/config.toml .gemini/settings.json

# Check global configurations  
ls -la ~/.mcp.json ~/.claude.json ~/.cursor/mcp.json

# View configuration contents
cat .mcp.json | jq '.'
cat .cursor/mcp.json | jq '.'
```

### Verify TOML Files

```bash
# Check universal configuration
cat .agentinit/agentinit.toml

# Validate TOML syntax
npm install -g @taplo/cli
taplo check .agentinit/agentinit.toml
```

### Test Agent Detection

```bash
# Detect available agents in current project
node dist/index.js detect

# Show agent capabilities
node dist/index.js detect --verbose
```

---

## Performance Tests

### Large Configuration Test

```bash
# Add many MCP servers at once
node dist/index.js apply --agent claude \
  --mcp-stdio fs1 "npx -y @modelcontextprotocol/server-filesystem" --args "/path1" \
  --mcp-stdio fs2 "npx -y @modelcontextprotocol/server-filesystem" --args "/path2" \
  --mcp-stdio fs3 "npx -y @modelcontextprotocol/server-filesystem" --args "/path3" \
  --mcp-http api1 "https://api1.example.com/mcp" \
  --mcp-http api2 "https://api2.example.com/mcp" \
  --mcp-http api3 "https://api3.example.com/mcp" \
  --mcp-sse sse1 "https://sse1.example.com" \
  --mcp-sse sse2 "https://sse2.example.com"
```

### Configuration Merging Test

```bash
# Add initial configuration
node dist/index.js apply --agent claude \
  --mcp-stdio initial "npx -y @initial/mcp"

# Add more servers (should merge, not overwrite)
node dist/index.js apply --agent claude \
  --mcp-stdio additional "npx -y @additional/mcp" \
  --mcp-http api "https://api.example.com/mcp"

# Verify both servers exist
cat .mcp.json | jq '.mcpServers | keys'
```

---

## Environment-Specific Tests

### Development Environment

```bash
node dist/index.js apply --agent claude \
  --mcp-stdio dev-tools "npx -y @dev/mcp-server" \
  --args "--env development" \
  --env "NODE_ENV=development DEBUG=mcp:*"
```

### Production Environment

```bash
node dist/index.js apply --agent claude \
  --mcp-stdio prod-tools "npx -y @prod/mcp-server" \
  --args "--env production --log-level error" \
  --env "NODE_ENV=production"
```

### Testing Environment

```bash
node dist/index.js apply --agent claude \
  --mcp-stdio test-tools "npx -y @test/mcp-server" \
  --args "--mock-mode --test-data ./fixtures" \
  --env "NODE_ENV=test MOCK_EXTERNAL_APIS=true"
```

---

## Cleanup Commands

### Remove Test Configurations

```bash
# Remove project-level configs (be careful!)
rm -f .mcp.json .cursor/mcp.json .codex/config.toml .gemini/settings.json

# Remove universal config
rm -f .agentinit/agentinit.toml

# Note: Be very careful with global configs as they affect all projects
# Manually edit ~/.claude.json, ~/.cursor/mcp.json to remove test entries
```

---

## Troubleshooting

If tests fail, check:

1. **Agent Detection**: Ensure appropriate config files exist (CLAUDE.md, .cursorrules, etc.)
2. **Permissions**: Verify you have write permissions to configuration directories
3. **Dependencies**: Ensure MCP servers are available (try `npx -y @package/name --help`)
4. **API Keys**: Check that environment variables and tokens are valid
5. **Network**: Verify HTTP/SSE endpoints are accessible

### Debug Mode

```bash
# Run with verbose output
DEBUG=agentinit:* node dist/index.js apply --agent claude \
  --mcp-stdio debug-test "npx -y @debug/mcp-server"
```

---

## Notes

- Always backup existing configuration files before running tests
- Some MCP servers may require additional setup or API keys
- Global configurations affect all projects using that agent
- Test in a safe environment before applying to production projects
- Check the generated `.agentinit/agentinit.toml` file for the universal configuration format