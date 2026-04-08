import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPVerifier, MCPVerificationError } from '../../src/core/mcpClient.js';
import { MCPServerType, type MCPServerConfig, type MCPTool } from '../../src/types/index.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    getServerVersion: vi.fn().mockReturnValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
  }))
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('contextcalc', () => ({
  countTokens: vi.fn().mockReturnValue(42)
}));

// Helper function to create a mock Client with optional overrides
type MockClient = {
  connect: ReturnType<typeof vi.fn>;
  getServerVersion: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  listResources: ReturnType<typeof vi.fn>;
  listPrompts: ReturnType<typeof vi.fn>;
  readResource: ReturnType<typeof vi.fn>;
  getPrompt: ReturnType<typeof vi.fn>;
};

function createMockClient(overrides: Partial<MockClient> = {}): MockClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    getServerVersion: vi.fn().mockReturnValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
    readResource: vi.fn().mockResolvedValue({ contents: [] }),
    getPrompt: vi.fn().mockResolvedValue({ messages: [] }),
    ...overrides
  };
}

describe('MCPVerifier', () => {
  let verifier: MCPVerifier;

  beforeEach(() => {
    verifier = new MCPVerifier(5000);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default timeout', () => {
      expect(verifier).toBeInstanceOf(MCPVerifier);
    });

    it('should accept custom timeout', () => {
      const customVerifier = new MCPVerifier(15000);
      expect(customVerifier).toBeInstanceOf(MCPVerifier);
    });
  });

  describe('MCPVerificationError', () => {
    it('should create error with server name', () => {
      const error = new MCPVerificationError('Test error', 'test-server');

      expect(error.message).toBe('Test error');
      expect(error.serverName).toBe('test-server');
      expect(error.name).toBe('MCPVerificationError');
    });
  });

  describe('formatToolParameters', () => {
    it('should return empty array for tool without inputSchema', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        description: 'A test tool'
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toEqual([]);
    });

    it('should return empty array for tool with empty properties', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toEqual([]);
    });

    it('should format required and optional parameters correctly', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            requiredParam: { type: 'string', description: 'A required param' },
            optionalParam: { type: 'number', description: 'An optional param' }
          },
          required: ['requiredParam']
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('requiredParam (required)');
      expect(result[0]).toContain('string');
      expect(result[0]).toContain('A required param');
      expect(result[1]).toContain('optionalParam (optional)');
      expect(result[1]).toContain('number');
      expect(result[1]).toContain('An optional param');
    });

    it('should handle enum constraints', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              description: 'Operation mode',
              enum: ['read', 'write', 'execute']
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('mode (optional)');
      expect(result[0]).toContain('[read, write, execute]');
    });

    it('should handle min/max number constraints', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              description: 'Item count',
              minimum: 1,
              maximum: 100
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('count (optional)');
      expect(result[0]).toContain('(1-100)');
    });

    it('should handle minimum only constraint', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              minimum: 0
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('(0-∞)');
    });

    it('should handle maximum only constraint', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              maximum: 100
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('(-∞-100)');
    });

    it('should handle default values', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            timeout: {
              type: 'number',
              description: 'Timeout in seconds',
              default: 30
            },
            enabled: {
              type: 'boolean',
              default: true
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('default: 30');
      expect(result[1]).toContain('default: true');
    });

    it('should handle string length constraints', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'User name',
              minLength: 3,
              maxLength: 20
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('name (optional)');
      expect(result[0]).toContain('length: 3-20');
    });

    it('should handle minLength only constraint', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            password: {
              type: 'string',
              minLength: 8
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('length: 8-∞');
    });

    it('should handle maxLength only constraint', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              maxLength: 6
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('length: 0-6');
    });

    it('should handle pattern constraints', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Email address',
              pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('email (optional)');
      expect(result[0]).toContain('pattern:');
    });

    it('should handle array type with items', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              description: 'List of tags',
              items: {
                type: 'string'
              }
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('tags (optional)');
      expect(result[0]).toContain('array');
      expect(result[0]).toContain('items: string');
    });

    it('should handle array with min/max items', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            coordinates: {
              type: 'array',
              items: {
                type: 'number'
              },
              minItems: 2,
              maxItems: 3
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('coordinates (optional)');
      expect(result[0]).toContain('items: number');
      expect(result[0]).toContain('(2-3 items)');
    });

    it('should handle union types (array of types)', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: ['string', 'number'],
              description: 'A value that can be string or number'
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('value (optional)');
      expect(result[0]).toContain('string | number');
    });

    it('should handle complex schema with multiple constraints', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'User name',
              minLength: 3,
              maxLength: 20,
              pattern: '^[a-zA-Z]+$',
              default: 'anonymous'
            },
            age: {
              type: 'number',
              description: 'User age',
              minimum: 18,
              maximum: 120
            },
            role: {
              type: 'string',
              enum: ['admin', 'user', 'guest'],
              default: 'guest'
            }
          },
          required: ['name', 'age']
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(3);

      // name parameter
      expect(result[0]).toContain('name (required)');
      expect(result[0]).toContain('string');
      expect(result[0]).toContain('User name');
      expect(result[0]).toContain('length: 3-20');
      expect(result[0]).toContain('pattern:');
      expect(result[0]).toContain('default: "anonymous"');

      // age parameter
      expect(result[1]).toContain('age (required)');
      expect(result[1]).toContain('number');
      expect(result[1]).toContain('User age');
      expect(result[1]).toContain('(18-120)');

      // role parameter
      expect(result[2]).toContain('role (optional)');
      expect(result[2]).toContain('[admin, user, guest]');
      expect(result[2]).toContain('default: "guest"');
    });

    it('should handle tool without type field', () => {
      const tool: MCPTool = {
        name: 'test-tool',
        inputSchema: {
          properties: {
            param1: {
              description: 'First param'
            }
          }
        }
      };

      const result = (verifier as any).formatToolParameters(tool);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('param1 (optional)');
      expect(result[0]).toContain('any');
    });
  });

  describe('verifyServer with resource content fetching', () => {
    const testServer: MCPServerConfig = {
      name: 'test-server',
      type: MCPServerType.STDIO,
      command: 'test-command',
      args: []
    };

    it('should fetch resource contents when includeResourceContents is true', async () => {
      const mockClient = createMockClient({
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///test.txt', name: 'test.txt', description: 'Test file' }
          ]
        }),
        readResource: vi.fn().mockResolvedValue({
          contents: [{ text: 'Sample content from test.txt' }]
        })
      });

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeResourceContents: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.resources).toHaveLength(1);
      expect(result.capabilities?.resources?.[0]?.contents).toBe('Sample content from test.txt');
      expect(mockClient.readResource).toHaveBeenCalledWith({ uri: 'file:///test.txt' });
    });

    it('should skip resource contents when includeResourceContents is false', async () => {
      const mockClient = createMockClient({
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///test.txt', name: 'test.txt' }
          ]
        }),
        readResource: vi.fn().mockResolvedValue({
          contents: [{ text: 'Sample content' }]
        })
      });

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeResourceContents: false,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.resources).toHaveLength(1);
      expect(result.capabilities?.resources?.[0]?.contents).toBeUndefined();
      expect(mockClient.readResource).not.toHaveBeenCalled();
    });

    it('should skip resource contents by default', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///test.txt', name: 'test.txt' }
          ]
        }),
        readResource: vi.fn().mockResolvedValue({
          contents: [{ text: 'Sample content' }]
        }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.resources?.[0]?.contents).toBeUndefined();
      expect(mockClient.readResource).not.toHaveBeenCalled();
    });

    it('should handle text content', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///doc.md', name: 'doc.md' }
          ]
        }),
        readResource: vi.fn().mockResolvedValue({
          contents: [{ text: '# Documentation\n\nThis is a test document.' }]
        }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeResourceContents: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.resources?.[0]?.contents).toBe('# Documentation\n\nThis is a test document.');
    });

    it('should handle binary blob content', async () => {
      const binaryData = Buffer.from('binary data content').toString('base64');
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///image.png', name: 'image.png' }
          ]
        }),
        readResource: vi.fn().mockResolvedValue({
          contents: [{ blob: binaryData }]
        }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeResourceContents: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.resources?.[0]?.contents).toBeInstanceOf(Uint8Array);
    });

    it('should handle content exceeding size limit', async () => {
      // Create content larger than 10MB
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///large.txt', name: 'large.txt' }
          ]
        }),
        readResource: vi.fn().mockResolvedValue({
          contents: [{ text: largeContent }]
        }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeResourceContents: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      // Content should be skipped due to size limit
      expect(result.capabilities?.resources?.[0]?.contents).toBeUndefined();
    });

    it('should continue on failed resource fetch', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///test.txt', name: 'test.txt' }
          ]
        }),
        readResource: vi.fn().mockRejectedValue(new Error('Failed to read resource')),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeResourceContents: true,
        timeout: 5000
      });

      // Should still succeed despite failed resource fetch
      expect(result.status).toBe('success');
      expect(result.capabilities?.resources).toHaveLength(1);
      expect(result.capabilities?.resources?.[0]?.contents).toBeUndefined();
    });

    it('should handle resources without contents field', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///test.txt', name: 'test.txt' }
          ]
        }),
        readResource: vi.fn().mockResolvedValue({
          contents: []
        }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeResourceContents: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.resources?.[0]?.contents).toBeUndefined();
    });
  });

  describe('verifyServer with prompt template fetching', () => {
    const testServer: MCPServerConfig = {
      name: 'test-server',
      type: MCPServerType.STDIO,
      command: 'test-command',
      args: []
    };

    it('should fetch prompt templates when includePromptDetails is true', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'greeting', description: 'A greeting prompt' }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'Hello, how are you?' }
          ]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includePromptDetails: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts).toHaveLength(1);
      expect(result.capabilities?.prompts?.[0]?.template).toBe('Hello, how are you?');
      expect(mockClient.getPrompt).toHaveBeenCalledWith({ name: 'greeting', arguments: {} });
    });

    it('should skip prompt templates when includePromptDetails is false', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'greeting', description: 'A greeting prompt' }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'Hello!' }
          ]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includePromptDetails: false,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts).toHaveLength(1);
      expect(result.capabilities?.prompts?.[0]?.template).toBeUndefined();
      expect(mockClient.getPrompt).not.toHaveBeenCalled();
    });

    it('should skip prompt templates by default', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'greeting' }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [{ role: 'user', content: 'Hello!' }]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts?.[0]?.template).toBeUndefined();
      expect(mockClient.getPrompt).not.toHaveBeenCalled();
    });

    it('should handle string content in messages', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'test-prompt' }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'This is a string message' }
          ]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includePromptDetails: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts?.[0]?.template).toBe('This is a string message');
    });

    it('should handle object content with text property', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'test-prompt' }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: { text: 'This is object text content' } }
          ]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includePromptDetails: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts?.[0]?.template).toBe('This is object text content');
    });

    it('should handle JSON content', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'test-prompt' }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: { type: 'complex', data: [1, 2, 3] } }
          ]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includePromptDetails: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts?.[0]?.template).toContain('"type":"complex"');
    });

    it('should combine multiple messages', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'multi-message' }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'First message' },
            { role: 'assistant', content: 'Second message' },
            { role: 'user', content: 'Third message' }
          ]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includePromptDetails: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts?.[0]?.template).toBe('First message\n\nSecond message\n\nThird message');
    });

    it('should continue on failed prompt fetch', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'test-prompt' }
          ]
        }),
        getPrompt: vi.fn().mockRejectedValue(new Error('Failed to get prompt'))
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includePromptDetails: true,
        timeout: 5000
      });

      // Should still succeed despite failed prompt fetch
      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts).toHaveLength(1);
      expect(result.capabilities?.prompts?.[0]?.template).toBeUndefined();
    });

    it('should handle prompts with arguments', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            {
              name: 'parameterized-prompt',
              description: 'A prompt with parameters',
              arguments: [
                { name: 'userName', description: 'User name', required: true },
                { name: 'greeting', description: 'Greeting type', required: false }
              ]
            }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'Hello {userName}! {greeting}' }
          ]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includePromptDetails: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.prompts?.[0]?.arguments).toHaveLength(2);
      expect(result.capabilities?.prompts?.[0]?.arguments?.[0]).toEqual({
        name: 'userName',
        description: 'User name',
        required: true
      });
      expect(result.capabilities?.prompts?.[0]?.template).toBe('Hello {userName}! {greeting}');
    });
  });

  describe('verifyServer with token counting toggle', () => {
    const testServer: MCPServerConfig = {
      name: 'test-server',
      type: MCPServerType.STDIO,
      command: 'test-command',
      args: []
    };

    it('should calculate token counts by default', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'echo',
              description: 'Echo a message',
              inputSchema: {
                type: 'object',
                properties: {
                  message: { type: 'string', description: 'Message to echo' }
                },
                required: ['message']
              }
            }
          ]
        }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.toolTokenCounts).toBeDefined();
      expect(result.capabilities?.totalToolTokens).toBeDefined();
      expect(result.capabilities?.totalToolTokens).toBeGreaterThan(0);
      expect(result.capabilities?.toolTokenCounts?.get('echo')).toBeGreaterThan(0);
    });

    it('should calculate token counts when explicitly enabled', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'test-tool',
              description: 'A test tool',
              inputSchema: {
                type: 'object',
                properties: {
                  param: { type: 'string' }
                }
              }
            }
          ]
        }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeTokenCounts: true,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.toolTokenCounts).toBeDefined();
      expect(result.capabilities?.totalToolTokens).toBeDefined();
      expect(result.capabilities?.toolTokenCounts?.has('test-tool')).toBe(true);
    });

    it('should skip token counting when includeTokenCounts is false', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'large-tool',
              description: 'A tool with many parameters',
              inputSchema: {
                type: 'object',
                properties: {
                  param1: { type: 'string' },
                  param2: { type: 'number' },
                  param3: { type: 'boolean' },
                  param4: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          ]
        }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeTokenCounts: false,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      expect(result.capabilities?.toolTokenCounts).toBeUndefined();
      expect(result.capabilities?.totalToolTokens).toBeUndefined();
      expect(result.capabilities?.tools).toHaveLength(1);
      expect(result.capabilities?.tools?.[0]?.name).toBe('large-tool');
    });

    it('should return undefined for both token fields when disabled', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            { name: 'tool1', inputSchema: { type: 'object', properties: {} } },
            { name: 'tool2', inputSchema: { type: 'object', properties: {} } },
            { name: 'tool3', inputSchema: { type: 'object', properties: {} } }
          ]
        }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeTokenCounts: false,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      // Both token fields should be undefined
      expect(result.capabilities?.toolTokenCounts).toBeUndefined();
      expect(result.capabilities?.totalToolTokens).toBeUndefined();
      // But tools should still be listed
      expect(result.capabilities?.tools).toHaveLength(3);
    });

    it('should calculate correct total token count for multiple tools', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'tool1',
              description: 'First tool',
              inputSchema: {
                type: 'object',
                properties: { param: { type: 'string' } }
              }
            },
            {
              name: 'tool2',
              description: 'Second tool',
              inputSchema: {
                type: 'object',
                properties: { value: { type: 'number' } }
              }
            }
          ]
        }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.toolTokenCounts).toBeDefined();
      expect(result.capabilities?.totalToolTokens).toBeDefined();

      const tool1Tokens = result.capabilities?.toolTokenCounts?.get('tool1') || 0;
      const tool2Tokens = result.capabilities?.toolTokenCounts?.get('tool2') || 0;
      const totalTokens = result.capabilities?.totalToolTokens || 0;

      expect(tool1Tokens).toBeGreaterThan(0);
      expect(tool2Tokens).toBeGreaterThan(0);
      expect(totalTokens).toBe(tool1Tokens + tool2Tokens);
    });

    it('should work with combined options', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({
          tools: [
            {
              name: 'test-tool',
              inputSchema: {
                type: 'object',
                properties: { msg: { type: 'string' } }
              }
            }
          ]
        }),
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///test.txt', name: 'test.txt' }
          ]
        }),
        readResource: vi.fn().mockResolvedValue({
          contents: [{ text: 'Test content' }]
        }),
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [
            { name: 'test-prompt' }
          ]
        }),
        getPrompt: vi.fn().mockResolvedValue({
          messages: [{ role: 'user', content: 'Test' }]
        })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        includeResourceContents: true,
        includePromptDetails: true,
        includeTokenCounts: false,
        timeout: 5000
      });

      expect(result.status).toBe('success');
      // Resources and prompts should be fetched
      expect(result.capabilities?.resources?.[0]?.contents).toBe('Test content');
      expect(result.capabilities?.prompts?.[0]?.template).toBe('Test');
      // But tokens should not be calculated
      expect(result.capabilities?.toolTokenCounts).toBeUndefined();
      expect(result.capabilities?.totalToolTokens).toBeUndefined();
    });
  });

  describe('verifyServer with configurable concurrency', () => {
    const testServer: MCPServerConfig = {
      name: 'test-server',
      type: MCPServerType.STDIO,
      command: 'test-command',
      args: []
    };

    it('should use default MAX_CONCURRENT_FETCHES when option not specified', async () => {
      const mockClient = createMockClient({
        listResources: vi.fn().mockResolvedValue({
          resources: [
            { uri: 'file:///test1.txt' },
            { uri: 'file:///test2.txt' },
            { uri: 'file:///test3.txt' }
          ]
        })
      });

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      // Verify resources were fetched (concurrency limit was applied)
      expect(result.capabilities?.resources).toHaveLength(3);
    });

    it('should use custom maxConcurrentFetches when provided', async () => {
      const mockClient = createMockClient({
        listResources: vi.fn().mockResolvedValue({
          resources: Array.from({ length: 20 }, (_, i) => ({ uri: `file:///test${i}.txt` }))
        })
      });

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        timeout: 5000,
        maxConcurrentFetches: 2  // Very low limit
      });

      expect(result.status).toBe('success');
      // Verify all resources were fetched despite low concurrency
      expect(result.capabilities?.resources).toHaveLength(20);
    });

    it('should apply maxConcurrentFetches to prompt fetching as well', async () => {
      const mockClient = createMockClient({
        listPrompts: vi.fn().mockResolvedValue({
          prompts: Array.from({ length: 15 }, (_, i) => ({
            name: `prompt-${i}`,
            description: `Test prompt ${i}`
          }))
        })
      });

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, {
        timeout: 5000,
        maxConcurrentFetches: 3
      });

      expect(result.status).toBe('success');
      // Verify all prompts were fetched
      expect(result.capabilities?.prompts).toHaveLength(15);
    });
  });

  describe('verifyServer with version detection', () => {
    const testServer: MCPServerConfig = {
      name: 'test-server',
      type: MCPServerType.STDIO,
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp@latest']
    };

    // Mock fetch for npm registry tests
    const originalFetch = global.fetch;
    beforeEach(async () => {
      global.fetch = vi.fn();
      // Clear version cache between tests
      const { clearVersionCache } = await import('../../src/utils/packageVersion.js');
      clearVersionCache();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should extract version from MCP protocol getServerVersion', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue({
          name: 'test-server',
          version: '1.2.3'
        }),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('1.2.3');
      expect(result.capabilities?.serverInfo?.name).toBe('test-server');
      expect(mockClient.getServerVersion).toHaveBeenCalled();
    });

    it('should fallback to npm registry when version is unknown', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      // Mock npm registry response
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.7.0' })
      } as Response);

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('0.7.0');
      expect(fetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/chrome-devtools-mcp/latest',
        expect.any(Object)
      );
    });

    it('should extract explicit version from command without API call', async () => {
      const serverWithExplicitVersion: MCPServerConfig = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp@0.7.5']
      };

      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(serverWithExplicitVersion, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('0.7.5');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should skip npm fallback for HTTP servers', async () => {
      const httpServer: MCPServerConfig = {
        name: 'http-server',
        type: MCPServerType.HTTP,
        url: 'https://api.example.com/mcp'
      };

      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(httpServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('unknown');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should skip npm fallback for SSE servers', async () => {
      const sseServer: MCPServerConfig = {
        name: 'sse-server',
        type: MCPServerType.SSE,
        url: 'https://api.example.com/sse'
      };

      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(sseServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('unknown');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle npm registry fetch failure gracefully', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      // Mock npm registry failure
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      // Should still succeed with "unknown" version
      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('unknown');
    });

    it('should handle scoped packages with fallback', async () => {
      const scopedServer: MCPServerConfig = {
        name: 'scoped-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything']
      };

      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      // Mock npm registry for scoped package
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.6.2' })
      } as Response);

      const result = await verifier.verifyServer(scopedServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('0.6.2');
      expect(fetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/@modelcontextprotocol/server-everything/latest',
        expect.any(Object)
      );
    });

    it('should prefer MCP protocol version over npm fallback', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue({
          name: 'chrome-devtools-mcp',
          version: '0.8.0'
        }),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(testServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('0.8.0');
      // Should not call npm registry when MCP provides version
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle package extraction failure', async () => {
      const nonPackageServer: MCPServerConfig = {
        name: 'non-package-server',
        type: MCPServerType.STDIO,
        command: 'python',
        args: ['-m', 'mcp_server']
      };

      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        getServerVersion: vi.fn().mockReturnValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] })
      };

      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementation(() => mockClient as any);

      const result = await verifier.verifyServer(nonPackageServer, { timeout: 5000 });

      expect(result.status).toBe('success');
      expect(result.capabilities?.serverInfo?.version).toBe('unknown');
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});