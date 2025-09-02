import { MCPParser, MCPParseError } from '../../src/core/mcpParser.js';
import { MCPServerType } from '../../src/types/index.js';

describe('MCPParser', () => {
  describe('parseArguments', () => {
    it('should parse valid STDIO MCP with name and command', () => {
      const args = ['--mcp-stdio', 'myserver', 'npx -y @package/name'];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]).toEqual({
        name: 'myserver',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', '@package/name'],
        env: {}
      });
    });

    it('should parse STDIO MCP with args modifier', () => {
      const args = [
        '--mcp-stdio', 'context7', 'npx -y @upstash/context7-mcp',
        '--args', '--api-key=YOUR_API_KEY'
      ];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]).toEqual({
        name: 'context7',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp', '--api-key=YOUR_API_KEY'],
        env: {}
      });
    });

    it('should parse STDIO MCP with env modifier', () => {
      const args = [
        '--mcp-stdio', 'supabase', 'npx -y @supabase/mcp-server-supabase@latest',
        '--env', 'SUPABASE_ACCESS_TOKEN=token123 API_KEY=key456'
      ];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]).toEqual({
        name: 'supabase',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase@latest'],
        env: {
          SUPABASE_ACCESS_TOKEN: 'token123',
          API_KEY: 'key456'
        }
      });
    });

    it('should parse valid HTTP MCP with name and URL', () => {
      const args = ['--mcp-http', 'notion', 'https://mcp.notion.com/mcp'];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]).toEqual({
        name: 'notion',
        type: MCPServerType.HTTP,
        url: 'https://mcp.notion.com/mcp',
        headers: {}
      });
    });

    it('should parse HTTP MCP with auth modifier', () => {
      const args = [
        '--mcp-http', 'github', 'https://api.githubcopilot.com/mcp/',
        '--auth', 'Bearer YOUR_GITHUB_PAT'
      ];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]).toEqual({
        name: 'github',
        type: MCPServerType.HTTP,
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: 'Bearer YOUR_GITHUB_PAT'
        }
      });
    });

    it('should parse valid SSE MCP with name and URL', () => {
      const args = ['--mcp-sse', 'events', 'https://mcp.notion.com/sse'];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]).toEqual({
        name: 'events',
        type: MCPServerType.SSE,
        url: 'https://mcp.notion.com/sse'
      });
    });

    it('should parse multiple MCPs in one command', () => {
      const args = [
        '--mcp-stdio', 'supabase', 'npx -y @supabase/mcp-server-supabase@latest',
        '--mcp-http', 'notion', 'https://mcp.notion.com/mcp',
        '--mcp-sse', 'events', 'https://mcp.notion.com/sse'
      ];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(3);
      expect(result.servers[0]?.name).toBe('supabase');
      expect(result.servers[0]?.type).toBe(MCPServerType.STDIO);
      expect(result.servers[1]?.name).toBe('notion');
      expect(result.servers[1]?.type).toBe(MCPServerType.HTTP);
      expect(result.servers[2]?.name).toBe('events');
      expect(result.servers[2]?.type).toBe(MCPServerType.SSE);
    });

    it('should parse Docker commands correctly', () => {
      const args = [
        '--mcp-stdio', 'browserbase', 
        'docker run -i --rm ghcr.io/metorial/mcp-container node cli.js',
        '--env', 'BROWSERBASE_API_KEY=key123'
      ];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]).toEqual({
        name: 'browserbase',
        type: MCPServerType.STDIO,
        command: 'docker',
        args: ['run', '-i', '--rm', 'ghcr.io/metorial/mcp-container', 'node', 'cli.js'],
        env: {
          BROWSERBASE_API_KEY: 'key123'
        }
      });
    });

    it('should return empty servers array when no MCP arguments provided', () => {
      const args = ['--other-flag', 'value'];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(0);
    });
  });

  describe('validation for old syntax', () => {
    it('should throw error when STDIO name looks like a command', () => {
      const args = ['--mcp-stdio', 'npx -y @package/name'];
      
      expect(() => MCPParser.parseArguments(args)).toThrow(MCPParseError);
      expect(() => MCPParser.parseArguments(args)).toThrow(/The name appears to be a command/);
    });

    it('should throw error when STDIO name contains spaces', () => {
      const args = ['--mcp-stdio', 'docker run -i --rm image'];
      
      expect(() => MCPParser.parseArguments(args)).toThrow(MCPParseError);
      expect(() => MCPParser.parseArguments(args)).toThrow(/The name appears to be a command/);
    });

    it('should throw error when HTTP name looks like a URL', () => {
      const args = ['--mcp-http', 'https://mcp.notion.com/mcp'];
      
      expect(() => MCPParser.parseArguments(args)).toThrow(MCPParseError);
      expect(() => MCPParser.parseArguments(args)).toThrow(/The name appears to be a URL/);
    });

    it('should throw error when SSE name looks like a URL', () => {
      const args = ['--mcp-sse', 'https://mcp.notion.com/sse'];
      
      expect(() => MCPParser.parseArguments(args)).toThrow(MCPParseError);
      expect(() => MCPParser.parseArguments(args)).toThrow(/The name appears to be a URL/);
    });

    it('should throw error when HTTP name is localhost', () => {
      const args = ['--mcp-http', 'localhost:8000'];
      
      expect(() => MCPParser.parseArguments(args)).toThrow(MCPParseError);
      expect(() => MCPParser.parseArguments(args)).toThrow(/The name appears to be a URL/);
    });

    it('should allow valid names that contain underscores and numbers', () => {
      const args = ['--mcp-stdio', 'my_server_123', 'npx -y @package/name'];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]?.name).toBe('my_server_123');
    });

    it('should allow valid names with dashes', () => {
      const args = ['--mcp-http', 'my-api-server', 'https://example.com/api'];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]?.name).toBe('my-api-server');
    });
  });

  describe('edge cases', () => {
    it('should handle missing arguments gracefully', () => {
      const args = ['--mcp-stdio'];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(0);
    });

    it('should throw error for incomplete arguments', () => {
      const args = ['--mcp-stdio', 'myname'];
      
      expect(() => MCPParser.parseArguments(args)).toThrow(MCPParseError);
      expect(() => MCPParser.parseArguments(args)).toThrow(/Missing command for MCP server/);
    });

    it('should parse quoted commands with spaces correctly', () => {
      const args = ['--mcp-stdio', 'complex', 'python -m my.package --config "path with spaces"'];
      const result = MCPParser.parseArguments(args);
      
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]?.command).toBe('python');
      expect(result.servers[0]?.args).toContain('path with spaces');
    });
  });
});