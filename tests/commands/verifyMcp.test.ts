import { verifyMcpCommand } from '../../src/commands/verifyMcp.js';
import { AgentManager } from '../../src/core/agentManager.js';
import { MCPVerifier } from '../../src/core/mcpClient.js';
import { logger } from '../../src/utils/logger.js';
import { MCPServerType } from '../../src/types/index.js';

// Mock dependencies
jest.mock('../../src/core/agentManager.js');
jest.mock('../../src/core/mcpClient.js');
jest.mock('../../src/utils/logger.js');
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: ''
  }));
});

describe('verifyMcpCommand', () => {
  let mockAgentManager: jest.Mocked<AgentManager>;
  let mockVerifier: jest.Mocked<MCPVerifier>;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    mockAgentManager = new AgentManager() as jest.Mocked<AgentManager>;
    mockVerifier = new MCPVerifier() as jest.Mocked<MCPVerifier>;
    
    (AgentManager as jest.MockedClass<typeof AgentManager>).mockImplementation(() => mockAgentManager);
    (MCPVerifier as jest.MockedClass<typeof MCPVerifier>).mockImplementation(() => mockVerifier);
    
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  describe('validation', () => {
    it('should show usage when no options provided', async () => {
      await verifyMcpCommand({});

      expect(logger.title).toHaveBeenCalledWith('🔍 AgentInit - MCP Verification');
      expect(logger.info).toHaveBeenCalledWith('Usage: agentinit verify_mcp [options]');
    });

    it('should error when both --mcp-name and --all provided', async () => {
      try {
        await verifyMcpCommand({ mcpName: 'test', all: true });
      } catch (error) {
        expect(error).toEqual(new Error('process.exit called'));
      }

      expect(logger.error).toHaveBeenCalledWith('Cannot use --mcp-name and --all together. Choose one option.');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('agent detection', () => {
    it('should warn when no agents detected', async () => {
      mockAgentManager.detectAgents.mockResolvedValue([]);

      await verifyMcpCommand({ all: true });

      expect(mockAgentManager.detectAgents).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Run `agentinit detect` to see which agents are supported');
    });

    it('should warn when no MCP servers found', async () => {
      const mockAgent = {
        name: 'Claude',
        getMCPServers: jest.fn().mockResolvedValue([])
      };
      
      mockAgentManager.detectAgents.mockResolvedValue([
        { agent: mockAgent, configPath: '/test/.mcp.json' }
      ] as any);

      await verifyMcpCommand({ all: true });

      expect(logger.info).toHaveBeenCalledWith('Use `agentinit apply` to add MCP servers to your project');
    });
  });

  describe('verification', () => {
    const mockServers = [
      {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'node',
        args: ['test.js']
      }
    ];

    const mockAgent = {
      name: 'Claude',
      getMCPServers: jest.fn().mockResolvedValue(mockServers)
    };

    beforeEach(() => {
      mockAgentManager.detectAgents.mockResolvedValue([
        { agent: mockAgent, configPath: '/test/.mcp.json' }
      ] as any);
    });

    it('should verify all servers when --all flag used', async () => {
      const mockResults = [
        {
          server: mockServers[0],
          status: 'success' as const,
          capabilities: {
            tools: [],
            resources: [],
            prompts: []
          },
          connectionTime: 100
        }
      ];

      mockVerifier.verifyServers.mockResolvedValue(mockResults);
      mockVerifier.formatResults.mockReturnValue('✅ MCP Server: test-server (STDIO)\n   Status: Connected successfully (100ms)');

      await verifyMcpCommand({ all: true });

      expect(mockVerifier.verifyServers).toHaveBeenCalledWith(mockServers, undefined);
      expect(mockVerifier.formatResults).toHaveBeenCalledWith(mockResults);
    });

    it('should verify specific server when --mcp-name used', async () => {
      const mockResults = [
        {
          server: mockServers[0],
          status: 'success' as const,
          capabilities: {
            tools: [],
            resources: [],
            prompts: []
          },
          connectionTime: 100
        }
      ];

      mockVerifier.verifyServers.mockResolvedValue(mockResults);
      mockVerifier.formatResults.mockReturnValue('✅ MCP Server: test-server (STDIO)');

      await verifyMcpCommand({ mcpName: 'test-server' });

      expect(mockVerifier.verifyServers).toHaveBeenCalledWith(mockServers, undefined);
    });

    it('should error when specified MCP server not found', async () => {
      await verifyMcpCommand({ mcpName: 'nonexistent-server' });

      expect(logger.info).toHaveBeenCalledWith('Available MCP servers:');
      expect(logger.info).toHaveBeenCalledWith('  • test-server (stdio) - Claude');
    });

    it('should pass custom timeout to verifier', async () => {
      const mockResults = [
        {
          server: mockServers[0],
          status: 'success' as const,
          capabilities: { tools: [], resources: [], prompts: [] }
        }
      ];

      mockVerifier.verifyServers.mockResolvedValue(mockResults);
      mockVerifier.formatResults.mockReturnValue('Success');

      await verifyMcpCommand({ all: true, timeout: 15000 });

      expect(MCPVerifier).toHaveBeenCalledWith(15000);
      expect(mockVerifier.verifyServers).toHaveBeenCalledWith(mockServers, 15000);
    });

    it('should show summary for multiple servers', async () => {
      const multipleServers = [
        ...mockServers,
        {
          name: 'server2',
          type: MCPServerType.HTTP,
          url: 'https://example.com/mcp'
        }
      ];

      mockAgent.getMCPServers.mockResolvedValue(multipleServers);

      const mockResults = [
        {
          server: multipleServers[0],
          status: 'success' as const,
          capabilities: { tools: [], resources: [], prompts: [] }
        },
        {
          server: multipleServers[1],
          status: 'error' as const,
          error: 'Connection failed'
        }
      ];

      mockVerifier.verifyServers.mockResolvedValue(mockResults);
      mockVerifier.formatResults.mockReturnValue('Mixed results');

      await verifyMcpCommand({ all: true });

      expect(logger.info).toHaveBeenCalledWith('Summary:');
      expect(logger.info).toHaveBeenCalledWith('  ✅ Successful: 1');
      expect(logger.info).toHaveBeenCalledWith('  ❌ Failed: 1');
    });

    it('should show troubleshooting tips when some servers fail', async () => {
      const mockResults = [
        {
          server: mockServers[0],
          status: 'error' as const,
          error: 'Connection failed'
        }
      ];

      mockVerifier.verifyServers.mockResolvedValue(mockResults);
      mockVerifier.formatResults.mockReturnValue('Failed');

      await verifyMcpCommand({ all: true });

      expect(logger.info).toHaveBeenCalledWith('Troubleshooting Tips:');
      expect(logger.info).toHaveBeenCalledWith('  1. Ensure MCP server packages are installed');
    });

    it('should handle verification errors gracefully', async () => {
      mockVerifier.verifyServers.mockRejectedValue(new Error('Verification failed'));

      try {
        await verifyMcpCommand({ all: true });
      } catch (error) {
        expect(error).toEqual(new Error('process.exit called'));
      }

      expect(logger.error).toHaveBeenCalledWith('Error: Verification failed');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});