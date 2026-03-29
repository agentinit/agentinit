import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DroidAgent } from '../../src/agents/DroidAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

describe('DroidAgent', () => {
  let agent: DroidAgent;
  let accessSpy: any;
  let readFileSpy: any;
  let writeFileSpy: any;
  let mkdirSpy: any;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    agent = new DroidAgent();
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
      expect(agent.id).toBe('droid');
      expect(agent.name).toBe('Droid (Factory)');
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
      expect(agent.configFiles[0]?.path).toBe('AGENTS.md');
      expect(agent.configFiles[0]?.purpose).toBe('rules');
    });

    it('should have correct native config path', () => {
      expect(agent.nativeConfigPath).toBe('.factory/mcp.json');
    });

    it('should expose only project-level rules support', () => {
      expect(agent.getProjectRulesPath(testProjectPath)).toBe(resolve(testProjectPath, 'AGENTS.md'));
      expect(agent.supportsGlobalRules()).toBe(false);
      expect(agent.supportsProjectMcpConfig()).toBe(false);
    });
  });

  describe('detectPresence', () => {
    it('should detect agent when AGENTS.md exists', async () => {
      accessSpy.mockResolvedValueOnce(undefined);

      const result = await agent.detectPresence(testProjectPath);

      expect(result).not.toBeNull();
      expect(result!.agent.id).toBe('droid');
      expect(result!.configPath).toBe(resolve(testProjectPath, 'AGENTS.md'));
    });

    it('should return null when AGENTS.md does not exist', async () => {
      accessSpy.mockRejectedValue(new Error('not found'));

      const result = await agent.detectPresence(testProjectPath);

      expect(result).toBeNull();
    });
  });

  describe('applyMCPConfig and applyGlobalMCPConfig', () => {
    const mockServers: MCPServerConfig[] = [
      {
        name: 'chrome',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp@latest'],
        env: { NODE_ENV: 'production' }
      },
      {
        name: 'filesystem',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem']
      }
    ];

    it('should delegate applyMCPConfig to applyGlobalMCPConfig', async () => {
      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce('');
      writeFileSpy.mockResolvedValueOnce(undefined);

      await agent.applyMCPConfig(testProjectPath, mockServers);

      // Verify it writes to global path
      expect(writeFileSpy).toHaveBeenCalled();
      const writePath = writeFileSpy.mock.calls[0][0] as string;
      expect(writePath).toContain('.factory/mcp.json');
    });

    it('should create new ~/.factory/mcp.json configuration via applyGlobalMCPConfig', async () => {
      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce('');
      writeFileSpy.mockResolvedValueOnce(undefined);

      await agent.applyGlobalMCPConfig(mockServers);

      // Verify the write happened
      expect(writeFileSpy).toHaveBeenCalled();
      const writtenConfig = JSON.parse(
        writeFileSpy.mock.calls[0][1]
      );

      expect(writtenConfig.mcpServers).toHaveProperty('chrome');
      expect(writtenConfig.mcpServers).toHaveProperty('filesystem');

      // Check chrome server
      expect(writtenConfig.mcpServers['chrome']).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp@latest'],
        env: { NODE_ENV: 'production' },
        disabled: false
      });

      // Check filesystem server
      expect(writtenConfig.mcpServers['filesystem']).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        disabled: false
      });
    });

    it('should merge with existing ~/.factory/mcp.json configuration', async () => {
      const existingConfig = {
        mcpServers: {
          'existing-server': {
            type: 'stdio',
            command: 'existing',
            args: ['--test'],
            disabled: false
          }
        }
      };

      readFileSpy.mockResolvedValueOnce(JSON.stringify(existingConfig));
      mkdirSpy.mockResolvedValueOnce('');
      writeFileSpy.mockResolvedValueOnce(undefined);

      await agent.applyGlobalMCPConfig(mockServers);

      const writtenConfig = JSON.parse(
        writeFileSpy.mock.calls[0][1]
      );

      // Should preserve existing server
      expect(writtenConfig.mcpServers['existing-server']).toEqual({
        type: 'stdio',
        command: 'existing',
        args: ['--test'],
        disabled: false
      });

      // Should add new servers
      expect(writtenConfig.mcpServers).toHaveProperty('chrome');
      expect(writtenConfig.mcpServers).toHaveProperty('filesystem');
    });

    it('should handle invalid existing JSON gracefully', async () => {
      readFileSpy.mockResolvedValueOnce('invalid json');
      mkdirSpy.mockResolvedValueOnce('');
      writeFileSpy.mockResolvedValueOnce(undefined);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await agent.applyGlobalMCPConfig(mockServers);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Existing ~/.factory/mcp.json is invalid, creating new configuration'
      );

      const writtenConfig = JSON.parse(
        writeFileSpy.mock.calls[0][1]
      );

      expect(writtenConfig.mcpServers).toHaveProperty('chrome');

      consoleSpy.mockRestore();
    });
  });

  describe('filterMCPServers', () => {
    it('should filter out non-stdio servers', () => {
      const servers: MCPServerConfig[] = [
        { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
        { name: 'http', type: MCPServerType.HTTP, url: 'https://test.com' },
        { name: 'sse', type: MCPServerType.SSE, url: 'https://test.com/sse' }
      ];

      const filtered = agent.filterMCPServers(servers);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.type).toBe(MCPServerType.STDIO);
      expect(filtered[0]?.name).toBe('stdio');
    });

    it('should return all stdio servers', () => {
      const servers: MCPServerConfig[] = [
        { name: 'stdio1', type: MCPServerType.STDIO, command: 'test1' },
        { name: 'stdio2', type: MCPServerType.STDIO, command: 'test2' }
      ];

      const filtered = agent.filterMCPServers(servers);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('transformMCPServers', () => {
    it('should return servers unchanged (no transformations needed for stdio)', () => {
      const servers: MCPServerConfig[] = [
        { name: 'stdio', type: MCPServerType.STDIO, command: 'test' }
      ];

      const transformed = agent.transformMCPServers(servers);

      expect(transformed).toEqual(servers);
    });
  });

  describe('getNativeMcpPath', () => {
    it('should return project-relative path for .factory/mcp.json', () => {
      const path = agent.getNativeMcpPath(testProjectPath);

      expect(path).toBe(resolve(testProjectPath, '.factory/mcp.json'));
    });
  });

  describe('global configuration', () => {
    it('should support global configuration', () => {
      expect(agent.supportsGlobalConfig()).toBe(true);
    });

    it('should have correct global config path', () => {
      const globalPath = agent.getGlobalMcpPath();
      expect(globalPath).toContain('.factory/mcp.json');
    });
  });

  describe('getMCPServers', () => {
    it('should parse existing MCP servers from config', async () => {
      const existingConfig = {
        mcpServers: {
          'chrome': {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'chrome-devtools-mcp@latest'],
            disabled: false
          },
          'filesystem': {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            env: { PATH: '/usr/bin' }
          }
        }
      };

      readFileSpy.mockResolvedValueOnce(JSON.stringify(existingConfig));

      const servers = await agent.getMCPServers(testProjectPath);

      expect(servers).toHaveLength(2);
      expect(servers[0]).toEqual({
        name: 'chrome',
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp@latest']
      });
      expect(servers[1]).toEqual({
        name: 'filesystem',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: { PATH: '/usr/bin' }
      });
    });

    it('should return empty array when config file does not exist', async () => {
      readFileSpy.mockRejectedValueOnce(new Error('File not found'));

      const servers = await agent.getMCPServers(testProjectPath);

      expect(servers).toEqual([]);
    });

    it('should return empty array when config is invalid JSON', async () => {
      readFileSpy.mockResolvedValueOnce('invalid json');

      const servers = await agent.getMCPServers(testProjectPath);

      expect(servers).toEqual([]);
    });
  });
});
