import { ClaudeAgent } from '../agents/ClaudeAgent.js';
import { ClaudeDesktopAgent } from '../agents/ClaudeDesktopAgent.js';
import { CodexCliAgent } from '../agents/CodexCliAgent.js';
import { GeminiCliAgent } from '../agents/GeminiCliAgent.js';
import { CursorAgent } from '../agents/CursorAgent.js';
import { DroidAgent } from '../agents/DroidAgent.js';
import { CopilotAgent } from '../agents/CopilotAgent.js';
import { OpenClawAgent } from '../agents/OpenClawAgent.js';
import { HermesAgent } from '../agents/HermesAgent.js';
import { AiderAgent } from '../agents/AiderAgent.js';
import { ClineAgent } from '../agents/ClineAgent.js';
import { WindsurfAgent } from '../agents/WindsurfAgent.js';
import { RooCodeAgent } from '../agents/RooCodeAgent.js';
import { ZedAgent } from '../agents/ZedAgent.js';
import { Agent } from '../agents/Agent.js';
import type { AgentDetectionResult } from '../types/index.js';

interface AgentDetectionOptions {
  includeEnvironment?: boolean;
}

/**
 * Manager class for AI coding agents
 * Handles agent registration, detection, and selection
 */
export class AgentManager {
  private agents: Agent[] = [];

  constructor() {
    this.registerDefaultAgents();
  }

  /**
   * Register the default supported agents
   */
  private registerDefaultAgents(): void {
    this.agents = [
      new ClaudeAgent(),
      new ClaudeDesktopAgent(),
      new CopilotAgent(),
      new AiderAgent(),
      new ClineAgent(),
      new CodexCliAgent(),
      new GeminiCliAgent(),
      new CursorAgent(),
      new WindsurfAgent(),
      new RooCodeAgent(),
      new ZedAgent(),
      new DroidAgent(),
      new OpenClawAgent(),
      new HermesAgent(),
    ];
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): Agent[] {
    return [...this.agents];
  }

  /**
   * Get an agent by its ID
   */
  getAgentById(id: string): Agent | undefined {
    return this.agents.find(agent => agent.id === id);
  }

  /**
   * Get all supported agent IDs
   */
  getSupportedAgentIds(): string[] {
    return this.agents.map(agent => agent.id);
  }

  private shouldIncludeForDetection(
    agent: Agent,
    options: AgentDetectionOptions,
  ): boolean {
    if (options.includeEnvironment) {
      return true;
    }

    return agent.getDetectionScope() !== 'environment';
  }

  /**
   * Detect which agents are present in the given project path
   */
  async detectAgents(
    projectPath: string,
    options: AgentDetectionOptions = {},
  ): Promise<AgentDetectionResult[]> {
    const results: AgentDetectionResult[] = [];

    for (const agent of this.agents) {
      if (!this.shouldIncludeForDetection(agent, options)) {
        continue;
      }

      const detection = await agent.detectPresence(projectPath);
      if (detection) {
        results.push(detection);
      }
    }

    return results;
  }

  /**
   * Detect a specific agent by ID in the project path
   */
  async detectAgentById(
    projectPath: string,
    agentId: string,
    options: AgentDetectionOptions = {},
  ): Promise<AgentDetectionResult | null> {
    const agent = this.getAgentById(agentId);
    if (!agent) {
      return null;
    }

    if (!this.shouldIncludeForDetection(agent, options)) {
      return null;
    }

    return await agent.detectPresence(projectPath);
  }

  /**
   * Get the primary detected agent (first one found, prioritized by registration order)
   */
  async getPrimaryAgent(
    projectPath: string,
    options: AgentDetectionOptions = {},
  ): Promise<AgentDetectionResult | null> {
    const detectedAgents = await this.detectAgents(projectPath, options);
    return detectedAgents.length > 0 ? detectedAgents[0]! : null;
  }

  /**
   * Register a custom agent
   */
  registerAgent(agent: Agent): void {
    // Remove existing agent with same ID if present
    this.agents = this.agents.filter(existing => existing.id !== agent.id);
    this.agents.push(agent);
  }

  /**
   * Check if any agents are present in the project
   */
  async hasAnyAgents(
    projectPath: string,
    options: AgentDetectionOptions = {},
  ): Promise<boolean> {
    const detected = await this.detectAgents(projectPath, options);
    return detected.length > 0;
  }

  /**
   * Get a summary of all detected agents
   */
  async getDetectionSummary(
    projectPath: string,
    options: AgentDetectionOptions = {},
  ): Promise<string> {
    const detected = await this.detectAgents(projectPath, options);
    
    if (detected.length === 0) {
      return 'No AI coding agents detected in this project.';
    }

    const agentNames = detected.map(d => d.agent.name).join(', ');
    return `Detected ${detected.length} agent${detected.length > 1 ? 's' : ''}: ${agentNames}`;
  }

  /**
   * Filter agents by their capabilities
   */
  getAgentsByCapability(capability: keyof Agent['capabilities']): Agent[] {
    return this.agents.filter(agent => {
      const cap = agent.capabilities[capability];
      return typeof cap === 'boolean' ? cap : Object.values(cap).some(Boolean);
    });
  }
}
