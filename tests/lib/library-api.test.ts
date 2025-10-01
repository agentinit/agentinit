import { describe, it, expect } from 'vitest';
import { MCPVerifier, MCPVerificationError } from '../../src/lib/verifier/index.js';
import { MCPServerType, type MCPServerConfig } from '../../src/lib/types/index.js';
import { countTokens, MCPParser } from '../../src/lib/utils/index.js';

describe('Library API - Main Entry Point', () => {
  it('should export MCPVerifier from main entry point', async () => {
    const { MCPVerifier: ExportedVerifier } = await import('../../src/lib/index.js');
    expect(ExportedVerifier).toBeDefined();
    expect(typeof ExportedVerifier).toBe('function');
  });

  it('should export MCPServerType from main entry point', async () => {
    const { MCPServerType: ExportedServerType } = await import('../../src/lib/index.js');
    expect(ExportedServerType).toBeDefined();
    expect(ExportedServerType.STDIO).toBe('stdio');
    expect(ExportedServerType.HTTP).toBe('http');
    expect(ExportedServerType.SSE).toBe('sse');
  });

  it('should export utilities from main entry point', async () => {
    const { countTokens: exportedCountTokens, MCPParser: ExportedParser } = await import('../../src/lib/index.js');
    expect(exportedCountTokens).toBeDefined();
    expect(ExportedParser).toBeDefined();
  });
});

describe('Library API - Verifier Module', () => {
  it('should create MCPVerifier instance', () => {
    const verifier = new MCPVerifier();
    expect(verifier).toBeInstanceOf(MCPVerifier);
  });

  it('should accept custom timeout', () => {
    const verifier = new MCPVerifier(15000);
    expect(verifier).toBeInstanceOf(MCPVerifier);
  });

  it('should have verifyServer method', () => {
    const verifier = new MCPVerifier();
    expect(typeof verifier.verifyServer).toBe('function');
  });

  it('should have verifyServers method', () => {
    const verifier = new MCPVerifier();
    expect(typeof verifier.verifyServers).toBe('function');
  });

  it('should have formatResults method', () => {
    const verifier = new MCPVerifier();
    expect(typeof verifier.formatResults).toBe('function');
  });
});

describe('Library API - Types Module', () => {
  it('should export MCPServerType enum', () => {
    expect(MCPServerType.STDIO).toBe('stdio');
    expect(MCPServerType.HTTP).toBe('http');
    expect(MCPServerType.SSE).toBe('sse');
  });

  it('should allow creating MCPServerConfig objects', () => {
    const config: MCPServerConfig = {
      name: 'test-server',
      type: MCPServerType.STDIO,
      command: 'node',
      args: ['server.js']
    };

    expect(config.name).toBe('test-server');
    expect(config.type).toBe('stdio');
  });

  it('should allow creating HTTP server config', () => {
    const config: MCPServerConfig = {
      name: 'http-server',
      type: MCPServerType.HTTP,
      url: 'https://example.com',
      headers: {
        'Authorization': 'Bearer token'
      }
    };

    expect(config.name).toBe('http-server');
    expect(config.url).toBe('https://example.com');
  });
});

describe('Library API - Utils Module', () => {
  it('should export countTokens function', () => {
    expect(typeof countTokens).toBe('function');
  });

  it('should count tokens correctly', () => {
    const text = 'Hello world';
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(typeof tokens).toBe('number');
  });

  it('should export MCPParser', () => {
    expect(MCPParser).toBeDefined();
    expect(typeof MCPParser.parseArguments).toBe('function');
  });

  it('should parse STDIO MCP arguments', () => {
    const args = ['--mcp-stdio', 'test', 'node', 'server.js'];
    const result = MCPParser.parseArguments(args);

    expect(result.servers).toHaveLength(1);
    expect(result.servers[0]?.name).toBe('test');
    expect(result.servers[0]?.type).toBe('stdio');
    expect(result.servers[0]?.command).toBe('node');
  });
});

describe('Library API - Error Types', () => {
  it('should export MCPVerificationError', () => {
    const error = new MCPVerificationError('Test error', 'test-server');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MCPVerificationError);
    expect(error.message).toBe('Test error');
    expect(error.serverName).toBe('test-server');
  });
});

describe('Library API - TypeScript Types', () => {
  it('should have proper type inference', () => {
    const config: MCPServerConfig = {
      name: 'test',
      type: MCPServerType.STDIO,
      command: 'node',
      args: ['server.js'],
      env: { NODE_ENV: 'production' }
    };

    // This test passes if TypeScript compilation succeeds
    expect(config).toBeDefined();
  });
});
