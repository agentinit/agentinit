import type { MCPItem, MCPRegistry } from '../types/index.js';

export class MCPRegistryManager {
  private readonly registry: MCPRegistry = {
    mcps: [
      {
        name: 'playwright',
        category: 'testing',
        description: 'E2E testing and browser automation',
        stackCompatibility: ['javascript', 'typescript'],
        installCommand: 'npm install -D @playwright/test',
        agentInstructions: 'Use Playwright for E2E testing. Run tests with `npx playwright test`. Always write comprehensive tests that cover user workflows.',
        popularity: 9500,
        verified: true
      },
      {
        name: 'context7',
        category: 'documentation',
        description: 'Fetch and analyze documentation from URLs',
        stackCompatibility: ['javascript', 'typescript', 'python', 'rust', 'go'],
        installCommand: 'npm install -g @context7/cli',
        agentInstructions: 'Use Context7 to fetch latest documentation. Always reference official docs when implementing features.',
        popularity: 7200,
        verified: true
      },
      {
        name: '21st.dev',
        category: 'ui',
        description: 'UI component registry and design system tools',
        stackCompatibility: ['javascript', 'typescript'],
        installCommand: 'npm install @21st/components',
        agentInstructions: 'Use 21st.dev components for consistent UI. Follow the design system guidelines and accessibility standards.',
        popularity: 6800,
        verified: true
      },
      {
        name: 'sequential-thinking',
        category: 'quality',
        description: 'Enhanced AI reasoning and step-by-step problem solving',
        stackCompatibility: ['javascript', 'typescript', 'python', 'rust', 'go'],
        installCommand: 'npm install -g @sequential/thinking',
        agentInstructions: 'Use sequential thinking for complex problems. Break down tasks into logical steps and validate each step.',
        popularity: 8900,
        verified: true
      },
      {
        name: 'agent-warden',
        category: 'quality',
        description: 'Prevent common AI coding mistakes and enforce best practices',
        stackCompatibility: ['javascript', 'typescript', 'python', 'rust', 'go'],
        installCommand: 'npm install -g @warden/agent',
        agentInstructions: 'Agent Warden will monitor for anti-patterns. Always follow the warnings and suggestions it provides.',
        popularity: 5400,
        verified: true
      },
      {
        name: 'supabase-mcp',
        category: 'database',
        description: 'Supabase database integration and management',
        stackCompatibility: ['javascript', 'typescript'],
        installCommand: 'npm install @supabase/mcp',
        agentInstructions: 'Use Supabase MCP for database operations. Always use proper RLS policies and type-safe queries.',
        popularity: 7800,
        verified: true
      },
      {
        name: 'git-mcp',
        category: 'version-control',
        description: 'Enhanced Git operations and workflow automation',
        stackCompatibility: ['javascript', 'typescript', 'python', 'rust', 'go'],
        installCommand: 'npm install -g @git/mcp',
        agentInstructions: 'Use Git MCP for advanced version control. Always create meaningful commits and follow branch conventions.',
        popularity: 8200,
        verified: true
      },
      {
        name: 'docker-mcp',
        category: 'devops',
        description: 'Docker container management and optimization',
        stackCompatibility: ['javascript', 'typescript', 'python', 'rust', 'go'],
        installCommand: 'npm install -g @docker/mcp',
        agentInstructions: 'Use Docker MCP for containerization. Always optimize for security and performance.',
        popularity: 6900,
        verified: true
      }
    ]
  };

  getMCPs(): MCPItem[] {
    return this.registry.mcps;
  }

  searchMCPs(query: string): MCPItem[] {
    const lowercaseQuery = query.toLowerCase();
    return this.registry.mcps.filter(mcp => 
      mcp.name.toLowerCase().includes(lowercaseQuery) ||
      mcp.description.toLowerCase().includes(lowercaseQuery) ||
      mcp.category.toLowerCase().includes(lowercaseQuery)
    );
  }

  getMCPsByCategory(category: string): MCPItem[] {
    return this.registry.mcps.filter(mcp => mcp.category === category);
  }

  getMCPsForStack(stack: string): MCPItem[] {
    return this.registry.mcps.filter(mcp => 
      mcp.stackCompatibility.includes(stack)
    );
  }

  getTopMCPs(limit: number = 5): MCPItem[] {
    return this.registry.mcps
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);
  }

  getMCPByName(name: string): MCPItem | undefined {
    return this.registry.mcps.find(mcp => mcp.name === name);
  }

  getCategories(): string[] {
    const categories = new Set(this.registry.mcps.map(mcp => mcp.category));
    return Array.from(categories).sort();
  }
}