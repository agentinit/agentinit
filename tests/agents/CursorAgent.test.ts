import { CursorAgent } from '../../src/agents/CursorAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';

// Mock the fs module
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('CursorAgent', () => {
  let agent: CursorAgent;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    agent = new CursorAgent();
    jest.clearAllMocks();
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
      expect(agent.configFiles).toEqual([
        '.cursorrules',
        '.cursor/settings.json',
        '.cursor/mcp.json'
      ]);
    });

    it('should have correct native config path', () => {
      expect(agent.nativeConfigPath).toBe('.cursor/mcp.json');
    });
  });

  describe('detectPresence', () => {
    it('should detect agent when .cursorrules exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await agent.detectPresence(testProjectPath);

      expect(result).not.toBeNull();
      expect(result?.agent).toBe(agent);
      expect(result?.configPath).toBe(resolve(testProjectPath, '.cursorrules'));
      expect(mockFs.access).toHaveBeenCalledWith(
        resolve(testProjectPath, '.cursorrules')
      );
    });

    it('should detect agent when .cursor/settings.json exists', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce(undefined);

      const result = await agent.detectPresence(testProjectPath);

      expect(result).not.toBeNull();
      expect(result?.agent).toBe(agent);
      expect(result?.configPath).toBe(resolve(testProjectPath, '.cursor/settings.json'));
    });

    it('should detect agent when .cursor/mcp.json exists', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('File not found'))
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce(undefined);

      const result = await agent.detectPresence(testProjectPath);

      expect(result).not.toBeNull();
      expect(result?.agent).toBe(agent);
      expect(result?.configPath).toBe(resolve(testProjectPath, '.cursor/mcp.json'));
    });

    it('should return null when no config files exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const result = await agent.detectPresence(testProjectPath);

      expect(result).toBeNull();
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
      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce();

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

      expect(mockFs.writeFile).toHaveBeenCalledWith(
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

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(existingConfig));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce();

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

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        resolve(testProjectPath, '.cursor/mcp.json'),
        JSON.stringify(expectedConfig, null, 2),
        'utf8'
      );
    });

    it('should handle invalid existing JSON gracefully', async () => {
      mockFs.readFile.mockResolvedValueOnce('invalid json');
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

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

      expect(mockFs.writeFile).toHaveBeenCalledWith(
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

      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce();

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

      expect(mockFs.writeFile).toHaveBeenCalledWith(
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

      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce();

      await agent.applyMCPConfig(testProjectPath, [sseServer]);

      const expectedConfig = {
        mcpServers: {
          'sse-server': {
            url: 'https://api.example.com/sse',
            headers: { 'X-API-Key': 'secret' }
          }
        }
      };

      expect(mockFs.writeFile).toHaveBeenCalledWith(
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