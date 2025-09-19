import { describe, it, expect, vi } from 'vitest';
import { MCPVerifier, MCPVerificationError } from '../../src/core/mcpClient.js';
import { MCPServerType, type MCPServerConfig } from '../../src/types/index.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
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
});