import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeAgent } from '../../src/agents/ClaudeAgent.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('ClaudeAgent', () => {
  let agent: ClaudeAgent;
  let accessSpy: any;
  let readFileSpy: any;
  let writeFileSpy: any;
  let mkdirSpy: any;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    agent = new ClaudeAgent();
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
      expect(agent.id).toBe('claude');
      expect(agent.name).toBe('Claude Code');
      expect(agent.capabilities.mcp.stdio).toBe(true);
      expect(agent.capabilities.mcp.http).toBe(true);
      expect(agent.capabilities.mcp.sse).toBe(true);
      expect(agent.capabilities.rules).toBe(true);
      expect(agent.capabilities.hooks).toBe(true);
      expect(agent.capabilities.commands).toBe(true);
      expect(agent.capabilities.subagents).toBe(true);
      expect(agent.capabilities.statusline).toBe(true);
    });

    it('should have correct config files', () => {
      expect(agent.configFiles).toHaveLength(2);
      expect(agent.configFiles[0]?.path).toBe('CLAUDE.md');
      expect(agent.configFiles[1]?.path).toBe('.claude/config.md');
    });

    it('should have correct native config path', () => {
      expect(agent.nativeConfigPath).toBe('.mcp.json');
    });
  });

  describe('detectPresence', () => {
    it('should detect agent when CLAUDE.md exists', async () => {
      accessSpy.mockResolvedValueOnce(undefined);
      
      const result = await agent.detectPresence(testProjectPath);
      
      expect(result).not.toBeNull();
      expect(result!.agent.id).toBe('claude');
      expect(result!.configPath).toBe(resolve(testProjectPath, 'CLAUDE.md'));
    });

    it('should detect agent when .claude/config.md exists', async () => {
      accessSpy
        .mockRejectedValueOnce(new Error('CLAUDE.md not found'))
        .mockResolvedValueOnce(undefined);
      
      const result = await agent.detectPresence(testProjectPath);
      
      expect(result).not.toBeNull();
      expect(result!.configPath).toBe(resolve(testProjectPath, '.claude/config.md'));
    });

    it('should return null when no config files exist', async () => {
      accessSpy.mockRejectedValue(new Error('not found'));
      
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
        args: ['-y', '@test/package'],
        env: { TEST_ENV: 'value' }
      },
      {
        name: 'test-http',
        type: MCPServerType.HTTP,
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer token' }
      },
      {
        name: 'test-sse',
        type: MCPServerType.SSE,
        url: 'https://example.com/sse'
      }
    ];

    it('should create new .mcp.json configuration', async () => {
      readFileSpy.mockRejectedValueOnce(new Error('File not found'));
      mkdirSpy.mockResolvedValueOnce('');
      writeFileSpy.mockResolvedValueOnce(undefined);

      await agent.applyMCPConfig(testProjectPath, mockServers);

      expect(writeFileSpy).toHaveBeenCalledWith(
        resolve(testProjectPath, '.mcp.json'),
        expect.stringContaining('"mcpServers"'),
        'utf8'
      );

      const writtenConfig = JSON.parse(
        writeFileSpy.mock.calls[0][1]
      );

      expect(writtenConfig.mcpServers).toHaveProperty('test-stdio');
      expect(writtenConfig.mcpServers).toHaveProperty('test-http');
      expect(writtenConfig.mcpServers).toHaveProperty('test-sse');

      // Check stdio server
      expect(writtenConfig.mcpServers['test-stdio']).toEqual({
        command: 'npx',
        args: ['-y', '@test/package'],
        env: { TEST_ENV: 'value' }
      });

      // Check http server
      expect(writtenConfig.mcpServers['test-http']).toEqual({
        type: 'http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer token' }
      });

      // Check sse server
      expect(writtenConfig.mcpServers['test-sse']).toEqual({
        type: 'sse',
        url: 'https://example.com/sse'
      });
    });

    it('should merge with existing .mcp.json configuration', async () => {
      const existingConfig = {
        mcpServers: {
          'existing-server': {
            command: 'existing',
            args: ['--test']
          }
        },
        otherSettings: {
          theme: 'dark'
        }
      };

      readFileSpy.mockResolvedValueOnce(JSON.stringify(existingConfig));
      mkdirSpy.mockResolvedValueOnce('');
      writeFileSpy.mockResolvedValueOnce(undefined);

      await agent.applyMCPConfig(testProjectPath, mockServers);

      const writtenConfig = JSON.parse(
        writeFileSpy.mock.calls[0][1]
      );

      // Should preserve existing server and other settings
      expect(writtenConfig.mcpServers['existing-server']).toEqual({
        command: 'existing',
        args: ['--test']
      });
      expect(writtenConfig.otherSettings).toEqual({ theme: 'dark' });

      // Should add new servers
      expect(writtenConfig.mcpServers).toHaveProperty('test-stdio');
      expect(writtenConfig.mcpServers).toHaveProperty('test-http');
      expect(writtenConfig.mcpServers).toHaveProperty('test-sse');
    });

    it('should handle invalid existing JSON gracefully', async () => {
      readFileSpy.mockResolvedValueOnce('invalid json');
      mkdirSpy.mockResolvedValueOnce('');
      writeFileSpy.mockResolvedValueOnce(undefined);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await agent.applyMCPConfig(testProjectPath, mockServers);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Existing .mcp.json is invalid, creating new configuration'
      );

      const writtenConfig = JSON.parse(
        writeFileSpy.mock.calls[0][1]
      );

      expect(writtenConfig.mcpServers).toHaveProperty('test-stdio');
      
      consoleSpy.mockRestore();
    });
  });

  describe('filterMCPServers', () => {
    it('should return all servers (Claude supports everything)', () => {
      const servers: MCPServerConfig[] = [
        { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
        { name: 'http', type: MCPServerType.HTTP, url: 'https://test.com' },
        { name: 'sse', type: MCPServerType.SSE, url: 'https://test.com/sse' }
      ];

      const filtered = agent.filterMCPServers(servers);
      
      expect(filtered).toEqual(servers);
      expect(filtered).toHaveLength(3);
    });
  });

  describe('transformMCPServers', () => {
    it('should return servers unchanged (no transformations needed)', () => {
      const servers: MCPServerConfig[] = [
        { name: 'stdio', type: MCPServerType.STDIO, command: 'test' },
        { name: 'http', type: MCPServerType.HTTP, url: 'https://test.com' }
      ];

      const transformed = agent.transformMCPServers(servers);
      
      expect(transformed).toEqual(servers);
    });
  });

  describe('getNativeMcpPath', () => {
    it('should return correct path for .mcp.json', () => {
      const path = agent.getNativeMcpPath(testProjectPath);
      
      expect(path).toBe(resolve(testProjectPath, '.mcp.json'));
    });
  });

  describe('global configuration', () => {
    it('should support global configuration', () => {
      expect(agent.supportsGlobalConfig()).toBe(true);
    });

    it('should have correct global config path', () => {
      const globalPath = agent.getGlobalMcpPath();
      expect(globalPath).toContain('.claude.json');
    });
  });
});