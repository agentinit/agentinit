import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CursorAgent } from '../../src/agents/CursorAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('CursorAgent', () => {
  let agent: CursorAgent;
  let accessSpy: any;
  let readFileSpy: any;
  let writeFileSpy: any;
  let mkdirSpy: any;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    agent = new CursorAgent();
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
      expect(agent.id).toBe('cursor');
      expect(agent.name).toBe('Cursor IDE');
      expect(agent.capabilities.mcp.stdio).toBe(true);
      expect(agent.capabilities.mcp.http).toBe(true);
      expect(agent.capabilities.mcp.sse).toBe(true);
      expect(agent.capabilities.rules).toBe(true);
      expect(agent.capabilities.hooks).toBe(false);
      expect(agent.capabilities.commands).toBe(false);
      expect(agent.capabilities.subagents).toBe(false);
      expect(agent.capabilities.statusline).toBe(false);
    });

    it('should have correct config files', () => {
      expect(agent.configFiles).toHaveLength(4);
      const paths = agent.configFiles.map(f => f.path);
      expect(paths).toContain('.cursor/rules');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('.cursor/settings.json');
      expect(paths).toContain('.cursor/mcp.json');
    });

    it('should have correct native config path', () => {
      expect(agent.nativeConfigPath).toBe('.cursor/mcp.json');
    });
  });

  describe('detectPresence', () => {
    // Note: These tests are simplified since the CursorAgent's config files changed
    // The agent will detect presence based on the first file that exists in the new order
    
    it('should return null when no config files exist', async () => {
      // Mock all files to not exist
      const originalPathExists = await import('../../src/utils/fs.js');
      const pathExistsSpy = vi.spyOn(originalPathExists, 'pathExists').mockResolvedValue(false);

      const result = await agent.detectPresence(testProjectPath);

      expect(result).toBeNull();
      pathExistsSpy.mockRestore();
    });

    it('should detect agent when any config file exists', async () => {
      // Mock AGENTS.md to exist (second in order after .cursor/rules)
      const originalPathExists = await import('../../src/utils/fs.js');
      const pathExistsSpy = vi.spyOn(originalPathExists, 'pathExists')
        .mockResolvedValueOnce(false) // .cursor/rules doesn't exist  
        .mockResolvedValueOnce(true);  // AGENTS.md exists

      const result = await agent.detectPresence(testProjectPath);

      expect(result).not.toBeNull();
      expect(result?.agent).toBe(agent);
      expect(result?.configPath).toBe(resolve(testProjectPath, 'AGENTS.md'));
      pathExistsSpy.mockRestore();
    });
  });

  describe('applyMCPConfig', () => {
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
      }
    ];

    it('should create new configuration when no existing config exists', async () => {
      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      await agent.applyMCPConfig(testProjectPath, mockServers);

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
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        resolve(testProjectPath, '.cursor/mcp.json'),
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

      await agent.applyMCPConfig(testProjectPath, mockServers);

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
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        resolve(testProjectPath, '.cursor/mcp.json'),
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );
    });

    it('should handle invalid existing JSON gracefully', async () => {
      readFileSpy.mockResolvedValueOnce('invalid json');
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await agent.applyMCPConfig(testProjectPath, mockServers);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Existing .cursor/mcp.json is invalid, creating new configuration'
      );

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
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        resolve(testProjectPath, '.cursor/mcp.json'),
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );

      consoleSpy.mockRestore();
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

      await agent.applyMCPConfig(testProjectPath, [stdioServer]);

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
        resolve(testProjectPath, '.cursor/mcp.json'),
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );
    });

    it('should handle SSE servers correctly', async () => {
      const sseServer: MCPServerConfig = {
        name: 'sse-server',
        type: MCPServerType.SSE,
        url: 'https://api.example.com/sse',
        headers: { 'X-API-Key': 'secret' }
      };

      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce(undefined);
      writeFileSpy.mockResolvedValueOnce();

      await agent.applyMCPConfig(testProjectPath, [sseServer]);

      const expectedConfig = {
        mcpServers: {
          'sse-server': {
            url: 'https://api.example.com/sse',
            headers: { 'X-API-Key': 'secret' }
          }
        }
      };

      expect(writeFileSpy).toHaveBeenCalledWith(
        resolve(testProjectPath, '.cursor/mcp.json'),
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

  describe('getNativeMcpPath', () => {
    it('should return correct path for MCP configuration', () => {
      const path = agent.getNativeMcpPath(testProjectPath);
      expect(path).toBe(resolve(testProjectPath, '.cursor/mcp.json'));
    });
  });

  describe('toString', () => {
    it('should return correct string representation', () => {
      expect(agent.toString()).toBe('Cursor IDE (cursor)');
    });
  });
});