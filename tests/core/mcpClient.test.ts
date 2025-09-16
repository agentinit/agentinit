import { MCPVerifier, MCPVerificationError } from '../../src/core/mcpClient.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('@modelcontextprotocol/sdk/client/stdio.js');
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js');
jest.mock('@modelcontextprotocol/sdk/client/sse.js');

describe('MCPVerifier', () => {
  let verifier: MCPVerifier;

  beforeEach(() => {
    verifier = new MCPVerifier(5000); // 5 second timeout for tests
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create verifier with default timeout', () => {
      const defaultVerifier = new MCPVerifier();
      expect(defaultVerifier).toBeInstanceOf(MCPVerifier);
    });

    it('should create verifier with custom timeout', () => {
      const customVerifier = new MCPVerifier(15000);
      expect(customVerifier).toBeInstanceOf(MCPVerifier);
    });
  });

  describe('verifyServer', () => {
    it('should handle successful STDIO server verification', async () => {
      const server: MCPServerConfig = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'node',
        args: ['test.js']
      };

      // Mock successful connection
      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [
            {
              name: 'test-tool',
              description: 'A test tool',
              inputSchema: { type: 'object' }
            }
          ]
        }),
        listResources: jest.fn().mockResolvedValue({
          resources: [
            {
              uri: 'test://resource',
              name: 'Test Resource',
              description: 'A test resource'
            }
          ]
        }),
        listPrompts: jest.fn().mockResolvedValue({
          prompts: [
            {
              name: 'test-prompt',
              description: 'A test prompt',
              arguments: []
            }
          ]
        }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      (Client as jest.MockedClass<any>).mockImplementation(() => mockClient);

      const result = await verifier.verifyServer(server);

      expect(result.status).toBe('success');
      expect(result.server).toBe(server);
      expect(result.capabilities).toBeDefined();
      expect(result.capabilities!.tools).toHaveLength(1);
      expect(result.capabilities!.resources).toHaveLength(1);
      expect(result.capabilities!.prompts).toHaveLength(1);
      expect(result.connectionTime).toBeGreaterThan(0);
    });

    it('should handle HTTP server verification', async () => {
      const server: MCPServerConfig = {
        name: 'http-server',
        type: MCPServerType.HTTP,
        url: 'https://example.com/mcp'
      };

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
        listResources: jest.fn().mockResolvedValue({ resources: [] }),
        listPrompts: jest.fn().mockResolvedValue({ prompts: [] }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      (Client as jest.MockedClass<any>).mockImplementation(() => mockClient);

      const result = await verifier.verifyServer(server);

      expect(result.status).toBe('success');
      expect(result.capabilities!.tools).toHaveLength(0);
      expect(result.capabilities!.resources).toHaveLength(0);
      expect(result.capabilities!.prompts).toHaveLength(0);
    });

    it('should handle connection timeout', async () => {
      const server: MCPServerConfig = {
        name: 'timeout-server',
        type: MCPServerType.STDIO,
        command: 'node',
        args: ['slow.js']
      };

      const mockClient = {
        connect: jest.fn().mockImplementation(() => 
          new Promise((resolve) => setTimeout(resolve, 10000)) // 10 second delay
        ),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      (Client as jest.MockedClass<any>).mockImplementation(() => mockClient);

      const result = await verifier.verifyServer(server, 100); // 100ms timeout

      expect(result.status).toBe('timeout');
      expect(result.error).toContain('Connection timeout');
      expect(result.connectionTime).toBeGreaterThanOrEqual(100);
    });

    it('should handle connection error', async () => {
      const server: MCPServerConfig = {
        name: 'error-server',
        type: MCPServerType.STDIO,
        command: 'nonexistent-command'
      };

      const mockClient = {
        connect: jest.fn().mockRejectedValue(new Error('Command not found')),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      (Client as jest.MockedClass<any>).mockImplementation(() => mockClient);

      const result = await verifier.verifyServer(server);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Command not found');
    });

    it('should handle missing command for STDIO server', async () => {
      const server: MCPServerConfig = {
        name: 'invalid-stdio',
        type: MCPServerType.STDIO
        // Missing command
      };

      const result = await verifier.verifyServer(server);

      expect(result.status).toBe('error');
      expect(result.error).toContain('STDIO server missing command');
    });

    it('should handle missing URL for HTTP server', async () => {
      const server: MCPServerConfig = {
        name: 'invalid-http',
        type: MCPServerType.HTTP
        // Missing URL
      };

      const result = await verifier.verifyServer(server);

      expect(result.status).toBe('error');
      expect(result.error).toContain('HTTP server missing URL');
    });
  });

  describe('verifyServers', () => {
    it('should verify multiple servers in parallel', async () => {
      const servers: MCPServerConfig[] = [
        {
          name: 'server1',
          type: MCPServerType.STDIO,
          command: 'node',
          args: ['test1.js']
        },
        {
          name: 'server2',
          type: MCPServerType.HTTP,
          url: 'https://example.com/mcp'
        }
      ];

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
        listResources: jest.fn().mockResolvedValue({ resources: [] }),
        listPrompts: jest.fn().mockResolvedValue({ prompts: [] }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      (Client as jest.MockedClass<any>).mockImplementation(() => mockClient);

      const results = await verifier.verifyServers(servers);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('success');
    });

    it('should handle mix of successful and failed verifications', async () => {
      const servers: MCPServerConfig[] = [
        {
          name: 'good-server',
          type: MCPServerType.STDIO,
          command: 'node',
          args: ['test.js']
        },
        {
          name: 'bad-server',
          type: MCPServerType.STDIO,
          command: 'nonexistent'
        }
      ];

      let callCount = 0;
      const mockClientFactory = () => {
        callCount++;
        if (callCount === 1) {
          // First server succeeds
          return {
            connect: jest.fn().mockResolvedValue(undefined),
            listTools: jest.fn().mockResolvedValue({ tools: [] }),
            listResources: jest.fn().mockResolvedValue({ resources: [] }),
            listPrompts: jest.fn().mockResolvedValue({ prompts: [] }),
            close: jest.fn().mockResolvedValue(undefined)
          };
        } else {
          // Second server fails
          return {
            connect: jest.fn().mockRejectedValue(new Error('Command not found')),
            close: jest.fn().mockResolvedValue(undefined)
          };
        }
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      (Client as jest.MockedClass<any>).mockImplementation(mockClientFactory);

      const results = await verifier.verifyServers(servers);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('error');
    });
  });

  describe('formatResults', () => {
    it('should format successful verification results', () => {
      const results = [
        {
          server: {
            name: 'test-server',
            type: MCPServerType.STDIO,
            command: 'node',
            args: ['test.js']
          },
          status: 'success' as const,
          capabilities: {
            tools: [
              { name: 'test-tool', description: 'A test tool' }
            ],
            resources: [
              { uri: 'test://resource', name: 'Test Resource' }
            ],
            prompts: [
              { name: 'test-prompt', description: 'A test prompt' }
            ],
            serverInfo: {
              name: 'test-server',
              version: '1.0.0'
            }
          },
          connectionTime: 150
        }
      ];

      const formatted = verifier.formatResults(results);

      expect(formatted).toContain('✅ MCP Server: test-server (STDIO)');
      expect(formatted).toContain('Status: Connected successfully (150ms)');
      expect(formatted).toContain('Tools (1):');
      expect(formatted).toContain('• test-tool - A test tool');
      expect(formatted).toContain('Resources (1):');
      expect(formatted).toContain('• Test Resource');
      expect(formatted).toContain('Prompts (1):');
      expect(formatted).toContain('• test-prompt - A test prompt');
    });

    it('should format failed verification results', () => {
      const results = [
        {
          server: {
            name: 'failed-server',
            type: MCPServerType.STDIO,
            command: 'nonexistent'
          },
          status: 'error' as const,
          error: 'Command not found',
          connectionTime: 50
        }
      ];

      const formatted = verifier.formatResults(results);

      expect(formatted).toContain('❌ MCP Server: failed-server (STDIO)');
      expect(formatted).toContain('Status: Failed (50ms)');
      expect(formatted).toContain('Error: Command not found');
      expect(formatted).toContain('Command: nonexistent');
    });

    it('should format timeout results', () => {
      const results = [
        {
          server: {
            name: 'timeout-server',
            type: MCPServerType.HTTP,
            url: 'https://slow.example.com/mcp'
          },
          status: 'timeout' as const,
          error: 'Connection timeout after 5000ms',
          connectionTime: 5000
        }
      ];

      const formatted = verifier.formatResults(results);

      expect(formatted).toContain('⏱️ MCP Server: timeout-server (HTTP)');
      expect(formatted).toContain('Status: Connection timeout (5000ms)');
      expect(formatted).toContain('URL: https://slow.example.com/mcp');
    });
  });
});

describe('MCPVerificationError', () => {
  it('should create error with message and server name', () => {
    const error = new MCPVerificationError('Test error', 'test-server');
    
    expect(error.message).toBe('Test error');
    expect(error.serverName).toBe('test-server');
    expect(error.name).toBe('MCPVerificationError');
    expect(error).toBeInstanceOf(Error);
  });
});