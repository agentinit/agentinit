import { describe, it, expect } from 'vitest';
import { CodexCliAgent } from '../../src/agents/CodexCliAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';

describe('CodexCliAgent Simple', () => {
  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      const agent = new CodexCliAgent();
      expect(agent.id).toBe('codex');
      expect(agent.name).toBe('OpenAI Codex CLI');
      expect(agent.capabilities.mcp.stdio).toBe(true);
      expect(agent.capabilities.mcp.http).toBe(false);
      expect(agent.capabilities.mcp.sse).toBe(false);
      expect(agent.capabilities.rules).toBe(true);
    });
  });

  describe('transformMCPServers', () => {
    it('should keep stdio servers unchanged', () => {
      const agent = new CodexCliAgent();
      const servers: MCPServerConfig[] = [
        {
          name: 'stdio-server',
          type: MCPServerType.STDIO,
          command: 'npx',
          args: ['-y', '@test/package'],
          env: { TEST_ENV: 'value' }
        }
      ];

      const transformed = agent.transformMCPServers(servers);
      
      expect(transformed).toEqual(servers);
    });

    it('should transform HTTP servers to stdio using mcp-remote', () => {
      const agent = new CodexCliAgent();
      const servers: MCPServerConfig[] = [
        {
          name: 'http-server',
          type: MCPServerType.HTTP,
          url: 'https://example.com/mcp',
          headers: { 'Authorization': 'Bearer token123' },
          env: { CUSTOM_ENV: 'value' }
        }
      ];

      const transformed = agent.transformMCPServers(servers);
      
      expect(transformed).toHaveLength(1);
      expect(transformed[0]).toEqual({
        name: 'http-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', 'mcp-remote@latest', 'https://example.com/mcp'],
        env: {
          CUSTOM_ENV: 'value',
          MCP_HEADER_AUTHORIZATION: 'Bearer token123'
        }
      });
    });
  });
});