import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodexCliAgent } from '../../src/agents/CodexCliAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';

// Mock the fs module
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  }
}));

const mockFs = fs as any;

describe('CodexCliAgent', () => {
  let agent: CodexCliAgent;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    agent = new CodexCliAgent();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(agent.id).toBe('codex');
      expect(agent.name).toBe('OpenAI Codex CLI');
      expect(agent.capabilities.mcp.stdio).toBe(true);
      expect(agent.capabilities.mcp.http).toBe(false);
      expect(agent.capabilities.mcp.sse).toBe(false);
      expect(agent.capabilities.rules).toBe(true);
      expect(agent.capabilities.hooks).toBe(false);
      expect(agent.capabilities.commands).toBe(false);
      expect(agent.capabilities.subagents).toBe(false);
      expect(agent.capabilities.statusline).toBe(false);
    });

    it('should have correct config files', () => {
      expect(agent.configFiles).toHaveLength(1);
      expect(agent.configFiles[0]?.path).toBe('.codex/config.toml');
    });

    it('should have correct native config path', () => {
      expect(agent.nativeConfigPath).toBe('.codex/config.toml');
    });
  });

  describe('detectPresence', () => {
    it('should detect agent when .codex/config.toml exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      
      const result = await agent.detectPresence(testProjectPath);
      
      expect(result).not.toBeNull();
      expect(result!.agent.id).toBe('codex');
      expect(result!.configPath).toBe(resolve(testProjectPath, '.codex/config.toml'));
    });

    it('should return null when config file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('not found'));
      
      const result = await agent.detectPresence(testProjectPath);
      
      expect(result).toBeNull();
    });
  });

  describe('transformMCPServers', () => {
    it('should keep stdio servers unchanged', () => {
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

    it('should transform SSE servers to stdio using mcp-remote', () => {
      const servers: MCPServerConfig[] = [
        {
          name: 'sse-server',
          type: MCPServerType.SSE,
          url: 'https://example.com/sse',
          env: { API_KEY: 'secret' }
        }
      ];

      const transformed = agent.transformMCPServers(servers);
      
      expect(transformed).toHaveLength(1);
      expect(transformed[0]).toEqual({
        name: 'sse-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', 'mcp-remote@latest', 'https://example.com/sse'],
        env: { API_KEY: 'secret' }
      });
    });

    it('should handle mixed server types', () => {
      const servers: MCPServerConfig[] = [
        {
          name: 'stdio-server',
          type: MCPServerType.STDIO,
          command: 'node',
          args: ['server.js']
        },
        {
          name: 'http-server',
          type: MCPServerType.HTTP,
          url: 'https://example.com/mcp'
        },
        {
          name: 'sse-server',
          type: MCPServerType.SSE,
          url: 'https://example.com/sse'
        }
      ];

      const transformed = agent.transformMCPServers(servers);
      
      expect(transformed).toHaveLength(3);
      
      // STDIO server unchanged
      expect(transformed[0]).toEqual({
        name: 'stdio-server',
        type: MCPServerType.STDIO,
        command: 'node',
        args: ['server.js']
      });

      // HTTP server transformed
      expect(transformed[1]).toEqual({
        name: 'http-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', 'mcp-remote@latest', 'https://example.com/mcp'],
        env: {}
      });

      // SSE server transformed
      expect(transformed[2]).toEqual({
        name: 'sse-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', 'mcp-remote@latest', 'https://example.com/sse'],
        env: {}
      });
    });

    it('should handle headers with special characters', () => {
      const servers: MCPServerConfig[] = [
        {
          name: 'complex-headers',
          type: MCPServerType.HTTP,
          url: 'https://example.com/mcp',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'key123',
            'Custom-Header': 'value'
          }
        }
      ];

      const transformed = agent.transformMCPServers(servers);
      
      expect(transformed[0]?.env).toEqual({
        'MCP_HEADER_CONTENT_TYPE': 'application/json',
        'MCP_HEADER_X_API_KEY': 'key123',
        'MCP_HEADER_CUSTOM_HEADER': 'value'
      });
    });
  });

  describe('applyMCPConfig', () => {
    it('should write TOML configuration with proper formatting', async () => {
      const servers: MCPServerConfig[] = [
        {
          name: 'test-server',
          type: MCPServerType.HTTP, // Will be transformed to stdio
          url: 'https://example.com/mcp',
          env: { API_KEY: 'test' }
        }
      ];

      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));
      mockFs.mkdir.mockResolvedValueOnce('');
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      await agent.applyMCPConfig(testProjectPath, servers);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        resolve(testProjectPath, '.codex/config.toml'),
        expect.stringContaining('# Codex CLI MCP Configuration'),
        'utf8'
      );

      const writtenConfig = (mockFs.writeFile as any).mock.calls[0][1];
      expect(writtenConfig).toContain('Generated automatically by agentinit');
      expect(writtenConfig).toContain('Remote MCPs are automatically converted');
      expect(writtenConfig).toContain('[mcp_servers.test-server]');
    });

    it('should merge with existing TOML configuration', async () => {
      const existingToml = `
[mcp_servers.existing]
command = "existing"
args = ["--test"]
`;

      const servers: MCPServerConfig[] = [
        {
          name: 'new-server',
          type: MCPServerType.STDIO,
          command: 'new',
          args: ['--new']
        }
      ];

      mockFs.readFile.mockResolvedValueOnce(existingToml);
      mockFs.mkdir.mockResolvedValueOnce('');
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      await agent.applyMCPConfig(testProjectPath, servers);

      const writtenConfig = (mockFs.writeFile as any).mock.calls[0][1];
      expect(writtenConfig).toContain('[mcp_servers.existing]');
      expect(writtenConfig).toContain('[mcp_servers.new-server]');
    });
  });
});