import { Agent } from '../../src/agents/Agent.js';
import { MCPServerType, type MCPServerConfig, type AgentDefinition } from '../../src/types/index.js';

// Mock the fs module
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
  }
}));

// Mock the paths utility
jest.mock('../../src/utils/paths.js', () => ({
  getFullGlobalConfigPath: jest.fn()
}));

import { getFullGlobalConfigPath } from '../../src/utils/paths.js';
const mockGetFullGlobalConfigPath = getFullGlobalConfigPath as jest.MockedFunction<typeof getFullGlobalConfigPath>;

// Create a concrete test agent class
class TestAgent extends Agent {
  async applyMCPConfig(projectPath: string, servers: MCPServerConfig[]): Promise<void> {
    // Mock implementation
    return Promise.resolve();
  }
}

describe('Agent global configuration functionality', () => {
  let agent: TestAgent;
  const testDefinition: AgentDefinition = {
    id: 'test',
    name: 'Test Agent',
    capabilities: {
      mcp: {
        stdio: true,
        http: true,
        sse: false
      },
      rules: true,
      hooks: false,
      commands: false,
      subagents: false,
      statusline: false
    },
    configFiles: ['.test-config'],
    nativeConfigPath: '.test/config.json',
    globalConfigPath: '~/.test/global.json'
  };

  beforeEach(() => {
    agent = new TestAgent(testDefinition);
    jest.clearAllMocks();
  });

  describe('getGlobalMcpPath', () => {
    it('should call getFullGlobalConfigPath with correct parameters', () => {
      mockGetFullGlobalConfigPath.mockReturnValue('/home/user/.test/global.json');
      
      const result = agent.getGlobalMcpPath();
      
      expect(mockGetFullGlobalConfigPath).toHaveBeenCalledWith(
        '~/.test/global.json',
        undefined
      );
      expect(result).toBe('/home/user/.test/global.json');
    });

    it('should handle platform-specific paths', () => {
      const agentWithPlatformPaths = new TestAgent({
        ...testDefinition,
        globalConfigPath: undefined,
        globalConfigPaths: {
          windows: '%APPDATA%/Test/config.json',
          darwin: '~/Library/Test/config.json',
          linux: '~/.config/test.json'
        }
      });

      mockGetFullGlobalConfigPath.mockReturnValue('/home/user/.config/test.json');
      
      const result = agentWithPlatformPaths.getGlobalMcpPath();
      
      expect(mockGetFullGlobalConfigPath).toHaveBeenCalledWith(
        undefined,
        {
          windows: '%APPDATA%/Test/config.json',
          darwin: '~/Library/Test/config.json',
          linux: '~/.config/test.json'
        }
      );
      expect(result).toBe('/home/user/.config/test.json');
    });

    it('should return null when no global config is available', () => {
      const agentWithoutGlobal = new TestAgent({
        ...testDefinition
      });

      mockGetFullGlobalConfigPath.mockReturnValue(null);
      
      const result = agentWithoutGlobal.getGlobalMcpPath();
      
      expect(result).toBeNull();
    });
  });

  describe('supportsGlobalConfig', () => {
    it('should return true when global config path is available', () => {
      mockGetFullGlobalConfigPath.mockReturnValue('/home/user/.test/global.json');
      
      expect(agent.supportsGlobalConfig()).toBe(true);
    });

    it('should return false when no global config path is available', () => {
      mockGetFullGlobalConfigPath.mockReturnValue(null);
      
      expect(agent.supportsGlobalConfig()).toBe(false);
    });
  });

  describe('applyGlobalMCPConfig', () => {
    const mockServers: MCPServerConfig[] = [
      {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'test-command'
      }
    ];

    it('should apply global configuration successfully', async () => {
      mockGetFullGlobalConfigPath.mockReturnValue('/home/user/.test/global.json');
      
      const applyMCPConfigSpy = jest.spyOn(agent, 'applyMCPConfig');
      applyMCPConfigSpy.mockResolvedValue();
      
      await agent.applyGlobalMCPConfig(mockServers);
      
      expect(applyMCPConfigSpy).toHaveBeenCalledWith('/home/user/.test', mockServers);
    });

    it('should restore original native config path after applying', async () => {
      mockGetFullGlobalConfigPath.mockReturnValue('/home/user/.test/global.json');
      
      const originalNativeConfigPath = agent.nativeConfigPath;
      const applyMCPConfigSpy = jest.spyOn(agent, 'applyMCPConfig');
      applyMCPConfigSpy.mockResolvedValue();
      
      await agent.applyGlobalMCPConfig(mockServers);
      
      expect(agent.nativeConfigPath).toBe(originalNativeConfigPath);
    });

    it('should restore original native config path even if applyMCPConfig throws', async () => {
      mockGetFullGlobalConfigPath.mockReturnValue('/home/user/.test/global.json');
      
      const originalNativeConfigPath = agent.nativeConfigPath;
      const applyMCPConfigSpy = jest.spyOn(agent, 'applyMCPConfig');
      applyMCPConfigSpy.mockRejectedValue(new Error('Test error'));
      
      await expect(agent.applyGlobalMCPConfig(mockServers)).rejects.toThrow('Test error');
      
      expect(agent.nativeConfigPath).toBe(originalNativeConfigPath);
    });

    it('should throw error when agent does not support global configuration', async () => {
      mockGetFullGlobalConfigPath.mockReturnValue(null);
      
      await expect(agent.applyGlobalMCPConfig(mockServers))
        .rejects.toThrow('Agent Test Agent does not support global configuration');
    });

    it('should handle Windows-style paths correctly', async () => {
      mockGetFullGlobalConfigPath.mockReturnValue('C:\\Users\\Test\\.test\\global.json');
      
      const applyMCPConfigSpy = jest.spyOn(agent, 'applyMCPConfig');
      applyMCPConfigSpy.mockResolvedValue();
      
      await agent.applyGlobalMCPConfig(mockServers);
      
      expect(applyMCPConfigSpy).toHaveBeenCalledWith('C:\\Users\\Test\\.test', mockServers);
    });

    it('should handle paths without directory separators', async () => {
      mockGetFullGlobalConfigPath.mockReturnValue('global.json');
      
      const applyMCPConfigSpy = jest.spyOn(agent, 'applyMCPConfig');
      applyMCPConfigSpy.mockResolvedValue();
      
      await agent.applyGlobalMCPConfig(mockServers);
      
      // When there's no directory separator, it should use empty string as directory
      expect(applyMCPConfigSpy).toHaveBeenCalledWith('', mockServers);
    });
  });

  describe('configuration path handling', () => {
    it('should handle complex nested global paths', async () => {
      mockGetFullGlobalConfigPath.mockReturnValue('/home/user/.config/test/deep/nested/config.json');
      
      const applyMCPConfigSpy = jest.spyOn(agent, 'applyMCPConfig');
      applyMCPConfigSpy.mockResolvedValue();
      
      await agent.applyGlobalMCPConfig([]);
      
      expect(applyMCPConfigSpy).toHaveBeenCalledWith('/home/user/.config/test/deep/nested', []);
    });

    it('should temporarily change native config path during global application', async () => {
      mockGetFullGlobalConfigPath.mockReturnValue('/home/user/.test/global.json');
      
      const originalNativeConfigPath = agent.nativeConfigPath;
      let capturedConfigPath: string | undefined;
      
      const applyMCPConfigSpy = jest.spyOn(agent, 'applyMCPConfig');
      applyMCPConfigSpy.mockImplementation(async () => {
        capturedConfigPath = agent.nativeConfigPath;
      });
      
      await agent.applyGlobalMCPConfig([]);
      
      expect(capturedConfigPath).toBe('global.json');
      expect(agent.nativeConfigPath).toBe(originalNativeConfigPath);
    });
  });
});