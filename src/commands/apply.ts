import ora from 'ora';
import { logger } from '../utils/logger.js';
import { MCPParser, MCPParseError } from '../core/mcpParser.js';
import { TOMLGenerator } from '../core/tomlGenerator.js';
import { readFileIfExists, writeFile, getAgentInitTomlPath } from '../utils/fs.js';
import { AgentManager } from '../core/agentManager.js';
import { MCPFilter } from '../core/mcpFilter.js';
import { MCPServerType } from '../types/index.js';

export async function applyCommand(args: string[]): Promise<void> {
  const cwd = process.cwd();
  
  logger.title('🔧 AgentInit - Apply Configuration');
  
  // Check if any MCP arguments are present
  const hasMcpArgs = args.some(arg => arg.startsWith('--mcp-'));
  
  // Check if --client or --agent is specified
  const clientArgIndex = args.findIndex(arg => arg === '--client' || arg === '--agent');
  const specifiedClient = clientArgIndex >= 0 && clientArgIndex + 1 < args.length 
    ? args[clientArgIndex + 1] 
    : null;
  
  // Check if --global flag is specified
  const isGlobal = args.includes('--global');
  
  if (!hasMcpArgs) {
    logger.info('Usage: agentinit apply [options]');
    logger.info('');
    logger.info('Options:');
    logger.info('  --client <agent>    Target specific agent (claude, claude-desktop, codex, gemini, cursor)');
    logger.info('  --agent <agent>     Alias for --client');
    logger.info('  --global            Apply configuration globally (requires --agent)');
    logger.info('                      If not specified, auto-detects agents in the project');
    logger.info('');
    logger.info('MCP Configuration Examples:');
    logger.info('  # Auto-detect agents and apply to all found');
    logger.info('  agentinit apply \\');
    logger.info('    --mcp-stdio context7 "npx -y @upstash/context7-mcp" --args "--api-key=YOUR_API_KEY"');
    logger.info('');
    logger.info('  # Target specific agent');
    logger.info('  agentinit apply --client claude \\');
    logger.info('    --mcp-http github "https://api.githubcopilot.com/mcp/" --auth "Bearer YOUR_GITHUB_PAT"');
    logger.info('');
    logger.info('  # Multiple MCPs with auto-detection');
    logger.info('  agentinit apply \\');
    logger.info('    --mcp-stdio supabase "npx -y @supabase/mcp-server-supabase@latest" \\');
    logger.info('      --args "--read-only --project-ref=<project-ref>" \\');
    logger.info('      --env "SUPABASE_ACCESS_TOKEN=<personal-access-token>" \\');
    logger.info('    --mcp-http notion_api "https://mcp.notion.com/mcp"');
    logger.info('');
    logger.info('  # Apply globally to specific agent');
    logger.info('  agentinit apply --global --agent claude \\');
    logger.info('    --mcp-stdio filesystem "npx -y @modelcontextprotocol/server-filesystem" \\');
    logger.info('      --args "/Users/username/Documents"');
    return;
  }

  const spinner = ora('Parsing configurations...').start();

  try {
    // Parse the MCP arguments (filter out --client, --agent, --global args)
    const mcpArgs = args.filter((arg, index) => {
      if (arg === '--client' || arg === '--agent' || arg === '--global') return false;
      if (index > 0 && (args[index - 1] === '--client' || args[index - 1] === '--agent')) return false;
      return true;
    });
    
    const parsed = MCPParser.parseArguments(mcpArgs);
    
    if (parsed.servers.length === 0) {
      spinner.warn('No MCP servers found in arguments');
      logger.info('Use `agentinit apply` without arguments to see usage examples');
      return;
    }

    // Validate global flag requirements
    if (isGlobal && !specifiedClient) {
      spinner.fail('--global flag requires --agent to specify target agent');
      logger.error('Example: agentinit apply --global --agent claude --mcp-stdio ...');
      process.exit(1);
    }

    spinner.text = isGlobal ? 'Preparing global configuration...' : 'Detecting agents...';
    
    // Initialize agent manager
    const agentManager = new AgentManager();
    
    // Determine target agents
    let targetAgents;
    
    if (specifiedClient) {
      // Use specified client
      const agent = agentManager.getAgentById(specifiedClient);
      if (!agent) {
        spinner.fail(`Unknown agent: ${specifiedClient}`);
        logger.error(`Supported agents: ${agentManager.getSupportedAgentIds().join(', ')}`);
        process.exit(1);
      }
      
      if (isGlobal) {
        // Global configuration - check if agent supports it
        if (!agent.supportsGlobalConfig()) {
          spinner.fail(`Agent ${agent.name} does not support global configuration`);
          process.exit(1);
        }
        
        targetAgents = [{ agent, configPath: agent.getGlobalMcpPath()! }];
        spinner.text = `Applying globally to ${agent.name}...`;
      } else {
        // Project-level configuration
        const detection = await agent.detectPresence(cwd);
        if (!detection) {
          spinner.warn(`Agent ${specifiedClient} not found in project`);
          logger.info(`To use ${agent.name}, ensure one of these files exists:`);
          agent.configFiles.forEach(file => logger.info(`  • ${file}`));
          return;
        }
        
        targetAgents = [detection];
        spinner.text = `Applying to ${agent.name}...`;
      }
    } else {
      // Auto-detect agents (only for project-level configurations)
      if (isGlobal) {
        // This shouldn't happen due to earlier validation, but just in case
        spinner.fail('Global configuration requires specifying an agent with --agent');
        process.exit(1);
      }
      
      const detectedAgents = await agentManager.detectAgents(cwd);
      
      if (detectedAgents.length === 0) {
        spinner.warn('No AI coding agents detected in this project');
        logger.info('Supported agents:');
        agentManager.getAllAgents().forEach(agent => {
          logger.info(`  • ${agent.name} (${agent.id})`);
          logger.info(`    Files: ${agent.configFiles.join(', ')}`);
        });
        logger.info('');
        logger.info('To target a specific agent, use: --agent <agent-id>');
        logger.info('To configure globally, use: --global --agent <agent-id>');
        return;
      }
      
      targetAgents = detectedAgents;
      const agentNames = detectedAgents.map(d => d.agent.name).join(', ');
      spinner.text = `Applying to detected agents: ${agentNames}`;
    }

    // Apply configuration to each target agent
    const results = [];
    
    for (const targetAgent of targetAgents) {
      const { agent } = targetAgent;
      
      // Filter and transform MCP servers for this agent
      const filtered = MCPFilter.filterForAgent(agent, parsed.servers);
      
      if (filtered.servers.length === 0) {
        logger.warning(`No compatible MCP servers for ${agent.name}`);
        continue;
      }
      
      // Apply configuration (global or project-specific)
      if (isGlobal) {
        await agent.applyGlobalMCPConfig(filtered.servers);
      } else {
        await agent.applyMCPConfig(cwd, filtered.servers);
      }
      
      results.push({
        agent,
        serversApplied: filtered.servers.length,
        transformations: filtered.transformations,
        configPath: isGlobal ? agent.getGlobalMcpPath()! : agent.getNativeMcpPath(cwd)
      });
    }

    // Generate the universal TOML file (only for project-level configurations)
    let tomlPath: string | null = null;
    if (!isGlobal) {
      tomlPath = await getAgentInitTomlPath(cwd);
      const existingToml = await readFileIfExists(tomlPath);
      
      let finalToml: string;
      if (existingToml) {
        finalToml = TOMLGenerator.mergeTOML(existingToml, parsed.servers);
      } else {
        finalToml = TOMLGenerator.generateTOML(parsed.servers);
      }
      
      await writeFile(tomlPath, finalToml);
    }

    if (isGlobal) {
      spinner.succeed('Global configuration applied successfully!');
    } else {
      spinner.succeed('Configuration applied successfully!');
    }
    
    // Report results
    if (tomlPath) {
      logger.info(`📁 Universal config saved to: ${tomlPath}`);
    }
    
    logger.info(`🔥 Applied ${parsed.servers.length} MCP server(s):`);
    
    parsed.servers.forEach(server => {
      logger.info(`  • ${server.name} (${server.type.toUpperCase()})`);
      if (server.type === MCPServerType.STDIO && server.command) {
        logger.info(`    Command: ${server.command} ${server.args?.join(' ') || ''}`);
      } else if (server.url) {
        logger.info(`    URL: ${server.url}`);
      }
    });
    
    logger.info('');
    if (isGlobal) {
      logger.info('🌍 Global configurations:');
    } else {
      logger.info('🤖 Agent-specific configurations:');
    }
    
    results.forEach(result => {
      logger.info(`  • ${result.agent.name}: ${result.serversApplied} server(s) → ${result.configPath}`);
      
      if (result.transformations.length > 0) {
        logger.info(`    ⚡ ${result.transformations.length} server(s) transformed for compatibility`);
        result.transformations.forEach(transform => {
          logger.info(`      - ${transform.original.name}: ${transform.reason}`);
        });
      }
    });

    logger.info('');
    logger.info('Next steps:');
    logger.info('  1. Review the generated configurations');
    logger.info('  2. Update environment variables with your actual API keys');
    if (isGlobal) {
      logger.info('  3. Restart your AI coding agent to load the new global MCP servers');
      logger.info('     Global configurations affect all projects using this agent');
    } else {
      logger.info('  3. Restart your AI coding agent to load the new MCP servers');
    }

  } catch (error) {
    spinner.fail('Failed to apply configuration');
    
    if (error instanceof MCPParseError) {
      logger.error('Configuration Error:');
      logger.error(error.message);
      logger.info('');
      logger.info('For help with the correct syntax, run: agentinit apply');
    } else {
      logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    process.exit(1);
  }
}