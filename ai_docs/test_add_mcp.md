# AgentInit MCP Testing Commands

## Prerequisites
1. Build: `npm run build`
2. Set API keys for MCP servers
3. Create agent config files where needed

## Basic MCP Server Types

### STDIO Servers
```bash
# Filesystem server
node dist/index.js apply --agent claude \
  --mcp-stdio filesystem "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/$(whoami)/Documents"

# With environment variables
node dist/index.js apply --agent claude \
  --mcp-stdio supabase "npx -y @supabase/mcp-server-supabase" \
  --args "--read-only --project-ref=your-ref" \
  --env "SUPABASE_ACCESS_TOKEN=token"
```

### HTTP Servers
```bash
# Basic HTTP server
node dist/index.js apply --agent claude \
  --mcp-http github "https://api.github.com/mcp" \
  --auth "Bearer ghp_token"
```

### SSE Servers  
```bash
# SSE server with auth
node dist/index.js apply --agent claude \
  --mcp-sse realtime "https://api.example.com/mcp/sse" \
  --auth "Bearer token"
```

## Agent-Specific Tests

### Claude Code
```bash
# Project config (.mcp.json)
node dist/index.js apply --agent claude \
  --mcp-stdio exa "npx -y @exa/mcp-server" \
  --env "EXA_API_KEY=key" \
  --mcp-http tools "https://tools.anthropic.com/mcp"

# Global config (~/.claude.json)
node dist/index.js apply --global --agent claude \
  --mcp-stdio global-fs "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/$(whoami)/shared"
```

### Cursor IDE
```bash
# Project config (.cursor/mcp.json)
node dist/index.js apply --agent cursor \
  --mcp-stdio cursor-fs "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/workspace" \
  --mcp-http cursor-api "https://cursor-tools.com/mcp"
```

### Codex CLI
```bash
# STDIO only (HTTP transformed via mcp-remote)
node dist/index.js apply --agent codex \
  --mcp-stdio local-tools "npx -y @codex/local-tools" \
  --mcp-http remote-api "https://api.example.com/mcp"  # Transformed
```

### Claude Desktop
```bash
# Global only
node dist/index.js apply --global --agent claude-desktop \
  --mcp-stdio desktop-fs "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/$(whoami)/Desktop"
```

## Multi-Server Tests

### Development Stack
```bash
node dist/index.js apply --agent claude \
  --mcp-stdio filesystem "npx -y @modelcontextprotocol/server-filesystem" \
  --args "/Users/$(whoami)/projects" \
  --mcp-stdio git "npx -y @git/mcp-server" \
  --mcp-http github "https://api.github.com/mcp" \
  --auth "Bearer ghp_token" \
  --mcp-stdio database "npx -y @database/mcp-tools" \
  --env "DATABASE_URL=postgres://localhost/devdb"
```

### Web Development
```bash
node dist/index.js apply --agent cursor \
  --mcp-stdio npm-tools "npx -y @npm/mcp-server" \
  --mcp-http vercel "https://api.vercel.com/mcp" \
  --auth "Bearer vercel_token" \
  --mcp-sse hot-reload "https://dev-server.local/sse"
```

## Error Handling Tests

```bash
# Missing server name (should fail)
node dist/index.js apply --agent claude --mcp-stdio

# Invalid agent (should fail)
node dist/index.js apply --agent invalid \
  --mcp-stdio test "npx -y test"

# No agent detection (should warn)
cd /tmp && node /path/to/agentinit/dist/index.js apply \
  --mcp-stdio test "npx -y test"
```

## Real-World Examples

### AI/ML Tools
```bash
# Ollama local models
node dist/index.js apply --agent claude \
  --mcp-stdio ollama "npx -y @ollama/mcp-server" \
  --args "--model-path ~/.ollama/models"

# Weights & Biases
node dist/index.js apply --agent claude \
  --mcp-http wandb "https://api.wandb.ai/mcp" \
  --auth "Bearer wandb_key"
```

### Development Tools
```bash
# Docker integration
node dist/index.js apply --agent cursor \
  --mcp-stdio docker "npx -y @docker/mcp-server" \
  --env "DOCKER_HOST=unix:///var/run/docker.sock"

# AWS integration
node dist/index.js apply --agent claude \
  --mcp-stdio aws "npx -y @aws/mcp-server" \
  --env "AWS_PROFILE=default AWS_REGION=us-west-2"
```

### Databases
```bash
# PostgreSQL
node dist/index.js apply --agent claude \
  --mcp-stdio postgres "npx -y @postgres/mcp-server" \
  --env "DATABASE_URL=postgresql://user:pass@localhost:5432/db"

# MongoDB
node dist/index.js apply --agent claude \
  --mcp-stdio mongodb "npx -y @mongodb/mcp-server" \
  --env "MONGO_URI=mongodb://localhost:27017/app"
```

### Content Management
```bash
# Notion
node dist/index.js apply --agent claude \
  --mcp-http notion "https://api.notion.com/mcp" \
  --auth "Bearer notion_token"

# Slack
node dist/index.js apply --agent claude \
  --mcp-http slack "https://slack.com/api/mcp" \
  --auth "Bearer xoxb-slack-token"
```

## Validation

### Check Generated Files
```bash
# Project configs
ls -la .mcp.json .cursor/mcp.json .codex/config.toml

# Global configs
ls -la ~/.mcp.json ~/.claude.json

# View contents
cat .mcp.json | jq '.'
```

### Agent Detection
```bash
# Detect agents
node dist/index.js detect

# Verbose info
node dist/index.js detect --verbose
```

### Verify TOML
```bash
# Check universal config
cat .agentinit/agentinit.toml

# Validate syntax
taplo check .agentinit/agentinit.toml
```

## Performance Tests

### Large Configuration
```bash
node dist/index.js apply --agent claude \
  --mcp-stdio fs1 "npx -y @modelcontextprotocol/server-filesystem" --args "/path1" \
  --mcp-stdio fs2 "npx -y @modelcontextprotocol/server-filesystem" --args "/path2" \
  --mcp-http api1 "https://api1.com/mcp" \
  --mcp-http api2 "https://api2.com/mcp" \
  --mcp-sse sse1 "https://sse1.com"
```

### Configuration Merging
```bash
# Initial config
node dist/index.js apply --agent claude \
  --mcp-stdio initial "npx -y @initial/mcp"

# Add more (should merge)
node dist/index.js apply --agent claude \
  --mcp-stdio additional "npx -y @additional/mcp"

# Verify both exist
cat .mcp.json | jq '.mcpServers | keys'
```

## Environment-Specific

### Development
```bash
node dist/index.js apply --agent claude \
  --mcp-stdio dev-tools "npx -y @dev/mcp-server" \
  --args "--env development" \
  --env "NODE_ENV=development DEBUG=mcp:*"
```

### Production
```bash
node dist/index.js apply --agent claude \
  --mcp-stdio prod-tools "npx -y @prod/mcp-server" \
  --args "--env production --log-level error" \
  --env "NODE_ENV=production"
```

## Troubleshooting

Check if tests fail:
1. **Agent Detection**: Config files exist (CLAUDE.md, .cursorrules, etc.)
2. **Permissions**: Write access to config directories
3. **Dependencies**: MCP servers available (`npx -y @package/name --help`)
4. **API Keys**: Valid environment variables and tokens
5. **Network**: HTTP/SSE endpoints accessible

### Debug Mode
```bash
DEBUG=agentinit:* node dist/index.js apply --agent claude \
  --mcp-stdio debug "npx -y @debug/mcp-server"
```

## Cleanup

```bash
# Remove project configs (careful!)
rm -f .mcp.json .cursor/mcp.json .codex/config.toml

# Remove universal config
rm -f .agentinit/agentinit.toml

# Manually edit global configs: ~/.claude.json, ~/.cursor/mcp.json
```

## Notes
- Backup configs before testing
- Some servers require additional setup/API keys  
- Global configs affect all projects
- Test in safe environment first
- Check `.agentinit/agentinit.toml` for universal format