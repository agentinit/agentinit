import { AgentManager } from '../../src/core/agentManager.js';
import { ClaudeAgent } from '../../src/agents/ClaudeAgent.js';
import { ClaudeDesktopAgent } from '../../src/agents/ClaudeDesktopAgent.js';
import { CodexCliAgent } from '../../src/agents/CodexCliAgent.js';
import { GeminiCliAgent } from '../../src/agents/GeminiCliAgent.js';
import { CursorAgent } from '../../src/agents/CursorAgent.js';
import { promises as fs } from 'fs';

// Mock the fs module
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('AgentManager', () => {
  let manager: AgentManager;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    manager = new AgentManager();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should register default agents', () => {
      const agents = manager.getAllAgents();
      
      expect(agents).toHaveLength(5);
      expect(agents.some(agent => agent.id === 'claude')).toBe(true);
      expect(agents.some(agent => agent.id === 'claude-desktop')).toBe(true);
      expect(agents.some(agent => agent.id === 'codex')).toBe(true);
      expect(agents.some(agent => agent.id === 'gemini')).toBe(true);
      expect(agents.some(agent => agent.id === 'cursor')).toBe(true);
    });
  });

  describe('getAgentById', () => {
    it('should return correct agent by ID', () => {
      const claudeAgent = manager.getAgentById('claude');
      const claudeDesktopAgent = manager.getAgentById('claude-desktop');
      const codexAgent = manager.getAgentById('codex');
      const geminiAgent = manager.getAgentById('gemini');
      const cursorAgent = manager.getAgentById('cursor');

      expect(claudeAgent).toBeInstanceOf(ClaudeAgent);
      expect(claudeDesktopAgent).toBeInstanceOf(ClaudeDesktopAgent);
      expect(codexAgent).toBeInstanceOf(CodexCliAgent);
      expect(geminiAgent).toBeInstanceOf(GeminiCliAgent);
      expect(cursorAgent).toBeInstanceOf(CursorAgent);
    });

    it('should return undefined for unknown agent ID', () => {
      const unknownAgent = manager.getAgentById('unknown');
      
      expect(unknownAgent).toBeUndefined();
    });
  });

  describe('getSupportedAgentIds', () => {
    it('should return all supported agent IDs', () => {
      const ids = manager.getSupportedAgentIds();
      
      expect(ids).toEqual(['claude', 'claude-desktop', 'codex', 'gemini', 'cursor']);
    });
  });

  describe('detectAgents', () => {
    it('should detect Claude agent when CLAUDE.md exists', async () => {
      // Mock Claude detection (first file exists)
      mockFs.access.mockImplementation((path) => {
        if (path.toString().includes('CLAUDE.md')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('not found'));
      });

      const detected = await manager.detectAgents(testProjectPath);
      
      expect(detected).toHaveLength(1);
      expect(detected[0]?.agent.id).toBe('claude');
    });

    it('should detect Codex agent when .codex/config.toml exists', async () => {
      mockFs.access.mockImplementation((path) => {
        if (path.toString().includes('.codex/config.toml')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('not found'));
      });

      const detected = await manager.detectAgents(testProjectPath);
      
      expect(detected).toHaveLength(1);
      expect(detected[0]?.agent.id).toBe('codex');
    });

    it('should detect multiple agents when multiple config files exist', async () => {
      mockFs.access.mockImplementation((path) => {
        if (path.toString().includes('CLAUDE.md') || 
            path.toString().includes('.codex/config.toml')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('not found'));
      });

      const detected = await manager.detectAgents(testProjectPath);
      
      expect(detected).toHaveLength(2);
      expect(detected.some(d => d.agent.id === 'claude')).toBe(true);
      expect(detected.some(d => d.agent.id === 'codex')).toBe(true);
    });

    it('should return empty array when no agents detected', async () => {
      mockFs.access.mockRejectedValue(new Error('not found'));

      const detected = await manager.detectAgents(testProjectPath);
      
      expect(detected).toHaveLength(0);
    });
  });

  describe('detectAgentById', () => {
    it('should detect specific agent by ID', async () => {
      mockFs.access.mockImplementation((path) => {
        if (path.toString().includes('CLAUDE.md')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('not found'));
      });

      const detected = await manager.detectAgentById(testProjectPath, 'claude');
      
      expect(detected).not.toBeNull();
      expect(detected?.agent.id).toBe('claude');
    });

    it('should return null for unknown agent ID', async () => {
      const detected = await manager.detectAgentById(testProjectPath, 'unknown');
      
      expect(detected).toBeNull();
    });

    it('should return null when agent exists but not detected', async () => {
      mockFs.access.mockRejectedValue(new Error('not found'));

      const detected = await manager.detectAgentById(testProjectPath, 'claude');
      
      expect(detected).toBeNull();
    });
  });

  describe('getPrimaryAgent', () => {
    it('should return first detected agent', async () => {
      mockFs.access.mockImplementation((path) => {
        if (path.toString().includes('CLAUDE.md') || 
            path.toString().includes('.codex/config.toml')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('not found'));
      });

      const primary = await manager.getPrimaryAgent(testProjectPath);
      
      expect(primary).not.toBeNull();
      expect(primary?.agent.id).toBe('claude'); // Claude is registered first
    });

    it('should return null when no agents detected', async () => {
      mockFs.access.mockRejectedValue(new Error('not found'));

      const primary = await manager.getPrimaryAgent(testProjectPath);
      
      expect(primary).toBeNull();
    });
  });

  describe('hasAnyAgents', () => {
    it('should return true when agents are detected', async () => {
      mockFs.access.mockImplementation((path) => {
        if (path.toString().includes('CLAUDE.md')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('not found'));
      });

      const hasAgents = await manager.hasAnyAgents(testProjectPath);
      
      expect(hasAgents).toBe(true);
    });

    it('should return false when no agents detected', async () => {
      mockFs.access.mockRejectedValue(new Error('not found'));

      const hasAgents = await manager.hasAnyAgents(testProjectPath);
      
      expect(hasAgents).toBe(false);
    });
  });

  describe('getDetectionSummary', () => {
    it('should return summary for detected agents', async () => {
      mockFs.access.mockImplementation((path) => {
        if (path.toString().includes('CLAUDE.md') || 
            path.toString().includes('.codex/config.toml')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('not found'));
      });

      const summary = await manager.getDetectionSummary(testProjectPath);
      
      expect(summary).toBe('Detected 2 agents: Claude Code, OpenAI Codex CLI');
    });

    it('should return single agent summary', async () => {
      mockFs.access.mockImplementation((path) => {
        if (path.toString().includes('CLAUDE.md')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('not found'));
      });

      const summary = await manager.getDetectionSummary(testProjectPath);
      
      expect(summary).toBe('Detected 1 agent: Claude Code');
    });

    it('should return no agents message', async () => {
      mockFs.access.mockRejectedValue(new Error('not found'));

      const summary = await manager.getDetectionSummary(testProjectPath);
      
      expect(summary).toBe('No AI coding agents detected in this project.');
    });
  });

  describe('registerAgent', () => {
    it('should register a new agent', () => {
      // Create a mock agent instead of trying to modify a real one
      const customAgent = {
        id: 'custom',
        name: 'Custom Agent',
        capabilities: { mcp: { stdio: true, http: false, sse: false }, rules: false, hooks: false, commands: false, subagents: false, statusline: false },
        configFiles: ['.custom/config.json'],
        nativeConfigPath: '.custom/config.json',
        detectPresence: jest.fn(),
        applyMCPConfig: jest.fn(),
        filterMCPServers: jest.fn(),
        transformMCPServers: jest.fn(),
        getNativeMcpPath: jest.fn(),
        toString: jest.fn()
      } as any;
      
      manager.registerAgent(customAgent);
      
      const agents = manager.getAllAgents();
      expect(agents).toHaveLength(6); // 5 default + 1 custom
      expect(manager.getAgentById('custom')).toBe(customAgent);
    });

    it('should replace existing agent with same ID', () => {
      const customClaudeAgent = new ClaudeAgent();
      const originalCount = manager.getAllAgents().length;
      
      manager.registerAgent(customClaudeAgent);
      
      const agents = manager.getAllAgents();
      expect(agents).toHaveLength(originalCount); // Same count, replaced existing
      expect(manager.getAgentById('claude')).toBe(customClaudeAgent);
    });
  });

  describe('getAgentsByCapability', () => {
    it('should return agents with MCP capabilities', () => {
      const mcpAgents = manager.getAgentsByCapability('mcp');
      
      expect(mcpAgents).toHaveLength(5); // All agents support some MCP
    });

    it('should return agents with hooks capability', () => {
      const hookAgents = manager.getAgentsByCapability('hooks');
      
      expect(hookAgents).toHaveLength(1); // Only Claude supports hooks
      expect(hookAgents[0]?.id).toBe('claude');
    });

    it('should return agents with rules capability', () => {
      const ruleAgents = manager.getAgentsByCapability('rules');
      
      expect(ruleAgents).toHaveLength(4); // All agents except claude-desktop support rules
    });

    it('should return agents with subagents capability', () => {
      const subagentAgents = manager.getAgentsByCapability('subagents');
      
      expect(subagentAgents).toHaveLength(1); // Only Claude supports subagents
      expect(subagentAgents[0]?.id).toBe('claude');
    });
  });
});