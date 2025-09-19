import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeDesktopAgent } from '../../src/agents/ClaudeDesktopAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('ClaudeDesktopAgent', () => {
  let agent: ClaudeDesktopAgent;
  let accessSpy: any;
  let readFileSpy: any;
  let writeFileSpy: any;
  let mkdirSpy: any;

  beforeEach(() => {
    agent = new ClaudeDesktopAgent();
    accessSpy = vi.spyOn(fs, 'access');
    readFileSpy = vi.spyOn(fs, 'readFile');
    writeFileSpy = vi.spyOn(fs, 'writeFile');
    mkdirSpy = vi.spyOn(fs, 'mkdir');
    
    // Mock mkdir to avoid filesystem operations
    mkdirSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(agent.id).toBe('claude-desktop');
      expect(agent.name).toBe('Claude Desktop');
      expect(agent.capabilities.mcp.stdio).toBe(true);
      expect(agent.capabilities.mcp.http).toBe(true);
      expect(agent.capabilities.mcp.sse).toBe(true);
      expect(agent.capabilities.rules).toBe(false);
      expect(agent.capabilities.hooks).toBe(false);
      expect(agent.capabilities.commands).toBe(false);
      expect(agent.capabilities.subagents).toBe(false);
      expect(agent.capabilities.statusline).toBe(false);
    });

    it('should have empty config files array', () => {
      expect(agent.configFiles).toEqual([]);
    });

    it('should have platform-specific global config paths', () => {
      const definition = (agent as any).definition;
      expect(definition.globalConfigPaths).toBeDefined();
      expect(definition.globalConfigPaths.windows).toContain('claude_desktop_config.json');
      expect(definition.globalConfigPaths.darwin).toContain('claude_desktop_config.json');
      expect(definition.globalConfigPaths.linux).toContain('claude_desktop_config.json');
    });
  });

  describe('detectPresence', () => {
    it('should always return null since it is desktop-only', async () => {
      const result = await agent.detectPresence();
      expect(result).toBeNull();
    });
  });

  describe('applyMCPConfig', () => {
    it('should throw error for project-level configuration', async () => {
      await expect(agent.applyMCPConfig())
        .rejects.toThrow('Claude Desktop only supports global configuration. Use --global flag.');
    });
  });

  describe('applyGlobalMCPConfig', () => {
    const mockServers: MCPServerConfig[] = [
      {
        name: 'test-stdio',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', 'test-server'],
        env: { TEST_KEY: 'test-value' }
      },
      {
        name: 'test-http',
        type: MCPServerType.HTTP,
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer token' }
      },
      {
        name: 'test-sse',
        type: MCPServerType.SSE,
        url: 'https://api.example.com/sse',
        headers: { 'X-API-Key': 'secret' }
      }
    ];

    beforeEach(() => {
      // Mock getGlobalMcpPath to return a test path
      vi.spyOn(agent, 'getGlobalMcpPath').mockReturnValue('/test/claude_desktop_config.json');
    });

    it('should create new configuration when no existing config exists', async () => {
      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      await agent.applyGlobalMCPConfig(mockServers);

      const expectedConfig = {
        mcpServers: {
          'test-stdio': {
            command: 'npx',
            args: ['-y', 'test-server'],
            env: { TEST_KEY: 'test-value' }
          },
          'test-http': {
            url: 'https://api.example.com/mcp',
            headers: { Authorization: 'Bearer token' }
          },
          'test-sse': {
            url: 'https://api.example.com/sse',
            headers: { 'X-API-Key': 'secret' }
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        '/test/claude_desktop_config.json',
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );
    });

    it('should merge with existing configuration', async () => {
      const existingConfig = {
        mcpServers: {
          'existing-server': {
            command: 'existing-command'
          }
        }
      };

      readFileSpy.mockResolvedValueOnce(JSON.stringify(existingConfig));
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      await agent.applyGlobalMCPConfig(mockServers);

      const expectedConfig = {
        mcpServers: {
          'existing-server': {
            command: 'existing-command'
          },
          'test-stdio': {
            command: 'npx',
            args: ['-y', 'test-server'],
            env: { TEST_KEY: 'test-value' }
          },
          'test-http': {
            url: 'https://api.example.com/mcp',
            headers: { Authorization: 'Bearer token' }
          },
          'test-sse': {
            url: 'https://api.example.com/sse',
            headers: { 'X-API-Key': 'secret' }
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        '/test/claude_desktop_config.json',
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );
    });

    it('should handle invalid existing JSON gracefully', async () => {
      readFileSpy.mockResolvedValueOnce('invalid json');
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await agent.applyGlobalMCPConfig(mockServers);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Existing claude_desktop_config.json is invalid, creating new configuration'
      );

      consoleSpy.mockRestore();
    });

    it('should throw error when global path cannot be determined', async () => {
      vi.spyOn(agent, 'getGlobalMcpPath').mockReturnValue(null);

      await expect(agent.applyGlobalMCPConfig(mockServers))
        .rejects.toThrow('Claude Desktop global configuration path could not be determined for this platform');
    });

    it('should handle stdio servers correctly', async () => {
      const stdioServer: MCPServerConfig = {
        name: 'stdio-only',
        type: MCPServerType.STDIO,
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'production' }
      };

      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      await agent.applyGlobalMCPConfig([stdioServer]);

      const expectedConfig = {
        mcpServers: {
          'stdio-only': {
            command: 'node',
            args: ['server.js'],
            env: { NODE_ENV: 'production' }
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        '/test/claude_desktop_config.json',
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );
    });

    it('should handle HTTP servers correctly', async () => {
      const httpServer: MCPServerConfig = {
        name: 'http-server',
        type: MCPServerType.HTTP,
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer token123' }
      };

      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      await agent.applyGlobalMCPConfig([httpServer]);

      const expectedConfig = {
        mcpServers: {
          'http-server': {
            url: 'https://api.example.com/mcp',
            headers: { Authorization: 'Bearer token123' }
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        '/test/claude_desktop_config.json',
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );
    });

    it('should handle empty environment and headers gracefully', async () => {
      const serverWithEmptyProps: MCPServerConfig = {
        name: 'minimal-server',
        type: MCPServerType.STDIO,
        command: 'test-command',
        args: [],
        env: {},
        headers: {}
      };

      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      await agent.applyGlobalMCPConfig([serverWithEmptyProps]);

      const expectedConfig = {
        mcpServers: {
          'minimal-server': {
            command: 'test-command'
            // Empty args, env, and headers should not be included
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        '/test/claude_desktop_config.json',
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );
    });
  });

  describe('filterMCPServers', () => {
    it('should return all servers unchanged', () => {
      const servers: MCPServerConfig[] = [
        { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
        { name: 'http', type: MCPServerType.HTTP, url: 'http://test' },
        { name: 'sse', type: MCPServerType.SSE, url: 'http://test/sse' }
      ];

      const result = agent.filterMCPServers(servers);

      expect(result).toEqual(servers);
      expect(result).toHaveLength(3);
    });
  });

  describe('transformMCPServers', () => {
    it('should return all servers unchanged', () => {
      const servers: MCPServerConfig[] = [
        { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
        { name: 'http', type: MCPServerType.HTTP, url: 'http://test' }
      ];

      const result = agent.transformMCPServers(servers);

      expect(result).toEqual(servers);
      expect(result).toHaveLength(2);
    });
  });

  describe('toString', () => {
    it('should return correct string representation', () => {
      expect(agent.toString()).toBe('Claude Desktop (claude-desktop)');
    });
  });
});