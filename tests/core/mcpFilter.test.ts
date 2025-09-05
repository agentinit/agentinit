import { MCPFilter } from '../../src/core/mcpFilter.js';
import { ClaudeAgent } from '../../src/agents/ClaudeAgent.js';
import { CodexCliAgent } from '../../src/agents/CodexCliAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';

describe('MCPFilter', () => {
  let claudeAgent: ClaudeAgent;
  let codexAgent: CodexCliAgent;

  beforeEach(() => {
    claudeAgent = new ClaudeAgent();
    codexAgent = new CodexCliAgent();
  });

  describe('filterForAgent', () => {
    const mockServers: MCPServerConfig[] = [
      {
        name: 'stdio-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', '@test/package']
      },
      {
        name: 'http-server',
        type: MCPServerType.HTTP,
        url: 'https://example.com/mcp',
        headers: { 'Authorization': 'Bearer token' }
      },
      {
        name: 'sse-server',
        type: MCPServerType.SSE,
        url: 'https://example.com/sse'
      }
    ];

    it('should return all servers for Claude (supports everything)', () => {
      const result = MCPFilter.filterForAgent(claudeAgent, mockServers);
      
      expect(result.servers).toHaveLength(3);
      expect(result.transformations).toHaveLength(0); // No transformations needed
    });

    it('should transform remote servers for Codex and track transformations', () => {
      const result = MCPFilter.filterForAgent(codexAgent, mockServers);
      
      expect(result.servers).toHaveLength(3); // All servers after transformation
      expect(result.transformations).toHaveLength(2); // HTTP and SSE transformed

      // Check that HTTP server was transformed
      const httpTransformation = result.transformations.find(t => t.original.name === 'http-server');
      expect(httpTransformation).toBeDefined();
      expect(httpTransformation?.transformed.type).toBe(MCPServerType.STDIO);
      expect(httpTransformation?.transformed.command).toBe('npx');
      expect(httpTransformation?.transformed.args).toContain('mcp-remote@latest');
      expect(httpTransformation?.reason).toContain('converted HTTP server');

      // Check that SSE server was transformed
      const sseTransformation = result.transformations.find(t => t.original.name === 'sse-server');
      expect(sseTransformation).toBeDefined();
      expect(sseTransformation?.transformed.type).toBe(MCPServerType.STDIO);
      expect(sseTransformation?.reason).toContain('converted SSE server');
    });

    it('should preserve stdio servers for Codex without transformation', () => {
      const stdioOnlyServers: MCPServerConfig[] = [
        {
          name: 'stdio-server',
          type: MCPServerType.STDIO,
          command: 'npx',
          args: ['-y', '@test/package']
        }
      ];

      const result = MCPFilter.filterForAgent(codexAgent, stdioOnlyServers);
      
      expect(result.servers).toHaveLength(1);
      expect(result.transformations).toHaveLength(0);
      expect(result.servers[0]).toEqual(stdioOnlyServers[0]);
    });
  });

  describe('filterByCapabilities', () => {
    const mockServers: MCPServerConfig[] = [
      { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
      { name: 'http', type: MCPServerType.HTTP, url: 'https://test.com' },
      { name: 'sse', type: MCPServerType.SSE, url: 'https://test.com/sse' }
    ];

    it('should filter servers based on capabilities (all supported)', () => {
      const capabilities = { stdio: true, http: true, sse: true };
      
      const filtered = MCPFilter.filterByCapabilities(mockServers, capabilities);
      
      expect(filtered).toHaveLength(3);
    });

    it('should filter servers based on capabilities (stdio only)', () => {
      const capabilities = { stdio: true, http: false, sse: false };
      
      const filtered = MCPFilter.filterByCapabilities(mockServers, capabilities);
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.type).toBe(MCPServerType.STDIO);
    });

    it('should filter servers based on capabilities (remote only)', () => {
      const capabilities = { stdio: false, http: true, sse: true };
      
      const filtered = MCPFilter.filterByCapabilities(mockServers, capabilities);
      
      expect(filtered).toHaveLength(2);
      expect(filtered.every(s => s.type !== MCPServerType.STDIO)).toBe(true);
    });

    it('should return empty array when no capabilities supported', () => {
      const capabilities = { stdio: false, http: false, sse: false };
      
      const filtered = MCPFilter.filterByCapabilities(mockServers, capabilities);
      
      expect(filtered).toHaveLength(0);
    });
  });

  describe('getFilteredOutServers', () => {
    const mockServers: MCPServerConfig[] = [
      { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
      { name: 'http', type: MCPServerType.HTTP, url: 'https://test.com' },
      { name: 'sse', type: MCPServerType.SSE, url: 'https://test.com/sse' }
    ];

    it('should return empty array for Claude (supports everything)', () => {
      const filteredOut = MCPFilter.getFilteredOutServers(claudeAgent, mockServers);
      
      expect(filteredOut).toHaveLength(0);
    });

    it('should return empty array for Codex (transforms everything)', () => {
      // Codex transforms all servers to stdio, so nothing gets filtered out
      const filteredOut = MCPFilter.getFilteredOutServers(codexAgent, mockServers);
      
      expect(filteredOut).toHaveLength(0);
    });
  });

  describe('validateCompatibility', () => {
    const mockServers: MCPServerConfig[] = [
      { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
      { name: 'http', type: MCPServerType.HTTP, url: 'https://test.com' },
      { name: 'sse', type: MCPServerType.SSE, url: 'https://test.com/sse' }
    ];

    it('should validate all servers as compatible for Claude', () => {
      const validation = MCPFilter.validateCompatibility(claudeAgent, mockServers);
      
      expect(validation.compatible).toHaveLength(3);
      expect(validation.incompatible).toHaveLength(0);
    });

    it('should validate mixed compatibility for a limited agent', () => {
      // Create a mock agent that only supports stdio
      const limitedAgent = {
        capabilities: {
          mcp: { stdio: true, http: false, sse: false }
        }
      } as any;

      const validation = MCPFilter.validateCompatibility(limitedAgent, mockServers);
      
      expect(validation.compatible).toHaveLength(1);
      expect(validation.compatible[0]?.type).toBe(MCPServerType.STDIO);
      expect(validation.incompatible).toHaveLength(2);
      expect(validation.incompatible.every(s => s.type !== MCPServerType.STDIO)).toBe(true);
    });
  });

  describe('getSummary', () => {
    const mockServers: MCPServerConfig[] = [
      { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
      { name: 'http', type: MCPServerType.HTTP, url: 'https://test.com' },
      { name: 'sse', type: MCPServerType.SSE, url: 'https://test.com/sse' }
    ];

    it('should generate summary for Claude (no transformations)', () => {
      const summary = MCPFilter.getSummary(claudeAgent, mockServers);
      
      expect(summary).toContain('Claude Code processed 3 MCP server(s)');
      expect(summary).toContain('3 servers will be applied');
      expect(summary).not.toContain('transformed');
      expect(summary).not.toContain('filtered out');
    });

    it('should generate summary for Codex (with transformations)', () => {
      const summary = MCPFilter.getSummary(codexAgent, mockServers);
      
      expect(summary).toContain('OpenAI Codex CLI processed 3 MCP server(s)');
      expect(summary).toContain('3 servers will be applied');
      expect(summary).toContain('2 servers were transformed');
    });

    it('should generate summary with filtered out servers', () => {
      // Create a mock agent that doesn't support SSE
      const limitedAgent = {
        name: 'Limited Agent',
        capabilities: {
          mcp: { stdio: true, http: true, sse: false }
        },
        transformMCPServers: (servers: MCPServerConfig[]) => servers,
        filterMCPServers: (servers: MCPServerConfig[]) => 
          servers.filter(s => s.type !== MCPServerType.SSE)
      } as any;

      const summary = MCPFilter.getSummary(limitedAgent, mockServers);
      
      expect(summary).toContain('Limited Agent processed 3 MCP server(s)');
      expect(summary).toContain('2 servers will be applied');
      expect(summary).toContain('1 servers were filtered out');
    });
  });
});