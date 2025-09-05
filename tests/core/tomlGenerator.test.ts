import { TOMLGenerator } from '../../src/core/tomlGenerator.js';
import { MCPServerConfig, MCPServerType } from '../../src/types/index.js';

describe('TOMLGenerator', () => {
  describe('generateTOML', () => {
    it('should format arrays inline for STDIO servers', () => {
      const servers: MCPServerConfig[] = [{
        name: 'supabase',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase@latest', '--read-only', '--project-ref=<project-ref>'],
        env: {
          SUPABASE_ACCESS_TOKEN: '<personal-access-token>'
        }
      }];

      const result = TOMLGenerator.generateTOML(servers);

      expect(result).toContain('args = ["-y", "@supabase/mcp-server-supabase@latest", "--read-only", "--project-ref=<project-ref>"]');
      expect(result).not.toContain('args = [\n');
    });

    it('should handle empty args array', () => {
      const servers: MCPServerConfig[] = [{
        name: 'simple',
        type: MCPServerType.STDIO,
        command: 'node',
        args: [],
        env: {}
      }];

      const result = TOMLGenerator.generateTOML(servers);

      expect(result).toContain('args = []');
    });

    it('should handle single arg array', () => {
      const servers: MCPServerConfig[] = [{
        name: 'single',
        type: MCPServerType.STDIO,
        command: 'node',
        args: ['script.js'],
        env: {}
      }];

      const result = TOMLGenerator.generateTOML(servers);

      expect(result).toContain('args = ["script.js"]');
    });

    it('should format multiple servers with arrays correctly', () => {
      const servers: MCPServerConfig[] = [
        {
          name: 'supabase',
          type: MCPServerType.STDIO,
          command: 'npx',
          args: ['-y', '@supabase/mcp-server-supabase@latest', '--read-only'],
          env: { SUPABASE_ACCESS_TOKEN: 'token' }
        },
        {
          name: 'notion',
          type: MCPServerType.HTTP,
          url: 'https://mcp.notion.com/mcp',
          headers: {}
        }
      ];

      const result = TOMLGenerator.generateTOML(servers);

      expect(result).toContain('args = ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"]');
      expect(result).toContain('[mcp_servers.supabase]');
      expect(result).toContain('[mcp_servers.notion]');
    });

    it('should not have arrays for HTTP servers', () => {
      const servers: MCPServerConfig[] = [{
        name: 'notion',
        type: MCPServerType.HTTP,
        url: 'https://mcp.notion.com/mcp',
        headers: {}
      }];

      const result = TOMLGenerator.generateTOML(servers);

      expect(result).toContain('url = "https://mcp.notion.com/mcp"');
      expect(result).not.toContain('args =');
    });
  });

  describe('mergeTOML', () => {
    it('should merge new servers with existing configuration and format arrays inline', () => {
      const existingToml = `# AgentInit MCP Configuration
# Generated automatically by agentinit

# --- MCP Server Definitions ---
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
`;

      const newServers: MCPServerConfig[] = [{
        name: 'supabase',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase@latest'],
        env: {}
      }];

      const result = TOMLGenerator.mergeTOML(existingToml, newServers);

      expect(result).toContain('args = ["-y", "@supabase/mcp-server-supabase@latest"]');
      expect(result).toContain('[mcp_servers.notion]');
      expect(result).toContain('[mcp_servers.supabase]');
      expect(result).not.toContain('args = [\n');
    });

    it('should handle invalid existing TOML gracefully', () => {
      const existingToml = 'invalid toml content [[[';
      const newServers: MCPServerConfig[] = [{
        name: 'test',
        type: MCPServerType.STDIO,
        command: 'node',
        args: ['test.js'],
        env: {}
      }];

      const result = TOMLGenerator.mergeTOML(existingToml, newServers);

      expect(result).toContain('args = ["test.js"]');
      expect(result).toContain('[mcp_servers.test]');
    });

    it('should format arrays with special characters correctly', () => {
      const servers: MCPServerConfig[] = [{
        name: 'complex',
        type: MCPServerType.STDIO,
        command: 'docker',
        args: ['run', '-i', '--rm', 'image:latest', '--config="path with spaces"'],
        env: {}
      }];

      const result = TOMLGenerator.generateTOML(servers);

      expect(result).toContain('args = ["run", "-i", "--rm", "image:latest", "--config=\\"path with spaces\\""]');
    });
  });
});