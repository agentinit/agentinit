import ora from 'ora';
import { logger } from '../utils/logger.js';
import { MCPParser, MCPParseError } from '../core/mcpParser.js';
import { RulesParser, RulesParseError } from '../core/rulesParser.js';
import { TOMLGenerator } from '../core/tomlGenerator.js';
import { readFileIfExists, writeFile, getAgentInitTomlPath } from '../utils/fs.js';
import { AgentManager } from '../core/agentManager.js';
import { MCPFilter } from '../core/mcpFilter.js';
import { MCPServerType, type AppliedRules } from '../types/index.js';

export async function applyCommand(args: string[]): Promise<void> {
  const cwd = process.cwd();
  
  logger.title('🔧 AgentInit - Apply Configuration');
  
  // Check if any MCP or Rules arguments are present
  const hasMcpArgs = args.some(arg => arg.startsWith('--mcp-'));
  const hasRulesArgs = args.some(arg => arg === '--rules' || arg === '--rule-raw' || arg === '--rules-file' || arg === '--rules-remote');
  
  // Check if --client or --agent is specified
  const clientArgIndex = args.findIndex(arg => arg === '--client' || arg === '--agent');
  const specifiedClient = clientArgIndex >= 0 && clientArgIndex + 1 < args.length 
    ? args[clientArgIndex + 1] 
    : null;
  
  // Check if --global flag is specified
  const isGlobal = args.includes('--global');
  
  if (!hasMcpArgs && !hasRulesArgs) {
    logger.info('Usage: agentinit apply [options]');
    logger.info('');
    logger.info('Options:');
    logger.info('  --client <agent>    Target specific agent (claude, claude-desktop, codex, gemini, cursor)');
    logger.info('  --agent <agent>     Alias for --client');
    logger.info('  --global            Apply configuration globally (requires --agent)');
    logger.info('                      If not specified, auto-detects agents in the project');
    logger.info('');
    logger.info('Rules Configuration Options:');
    logger.info('  --rules <templates>     Apply rule templates (comma-separated)');
    logger.info('                         Available: git, write_docs, use_git_worktrees, use_subagents, use_linter, write_tests');
    logger.info('  --rule-raw <rule>       Add a raw rule (can be used multiple times)');
    logger.info('  --rules-file <path>     Load rules from a file');
    logger.info('  --rules-remote <url>    Load rules from a remote URL');
    logger.info('  --auth <token>          Authentication token for remote rules (Bearer token)');
    logger.info('');
    logger.info('Rules Configuration Examples:');
    logger.info('  # Apply rule templates');
    logger.info('  agentinit apply --rules git,write_tests,use_linter');
    logger.info('');
    logger.info('  # Mix templates with raw rules');
    logger.info('  agentinit apply --rules git,write_docs --rule-raw "Use TypeScript strict mode"');
    logger.info('');
    logger.info('  # Load from file');
    logger.info('  agentinit apply --rules-file ./custom-rules.md');
    logger.info('');
    logger.info('  # Global rules application');
    logger.info('  agentinit apply --global --agent claude --rules git,write_tests');
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
    // Parse the MCP arguments (filter out --client, --agent, --global and rules args)
    const mcpArgs = args.filter((arg, index) => {
      // Filter out non-MCP arguments
      if (arg === '--client' || arg === '--agent' || arg === '--global') return false;
      if (arg === '--rules' || arg === '--rule-raw' || arg === '--rules-file' || arg === '--rules-remote' || arg === '--auth') return false;
      if (index > 0 && (args[index - 1] === '--client' || args[index - 1] === '--agent')) return false;
      if (index > 0 && (args[index - 1] === '--rules' || args[index - 1] === '--rule-raw' || args[index - 1] === '--rules-file' || args[index - 1] === '--rules-remote' || args[index - 1] === '--auth')) return false;
      return true;
    });
    
    // Parse MCP configuration if present
    const mcpParsed = hasMcpArgs ? MCPParser.parseArguments(mcpArgs) : { servers: [] };
    
    // Parse Rules configuration if present
    let appliedRules: AppliedRules | null = null;
    if (hasRulesArgs) {
      const rulesParser = new RulesParser();
      const rulesConfig = RulesParser.parseArguments(args);
      
      // Validate template IDs
      if (rulesConfig.templates.length > 0) {
        const invalidTemplates = rulesParser.validateTemplateIds(rulesConfig.templates);
        if (invalidTemplates.length > 0) {
          spinner.fail(`Unknown rule templates: ${invalidTemplates.join(', ')}`);
          logger.info('Available templates: git, write_docs, use_git_worktrees, use_subagents, use_linter, write_tests');
          process.exit(1);
        }
      }
      
      appliedRules = await rulesParser.processRules(rulesConfig);
    }
    
    if (mcpParsed.servers.length === 0 && (!appliedRules || appliedRules.merged.length === 0)) {
      spinner.warn('No MCP servers or rules found in arguments');
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
      const filtered = MCPFilter.filterForAgent(agent, mcpParsed.servers);
      
      const hasMcpServers = filtered.servers.length > 0;
      const hasRules = appliedRules && appliedRules.merged.length > 0 && agent.capabilities.rules;
      
      if (!hasMcpServers && !hasRules) {
        if (mcpParsed.servers.length > 0 && !agent.capabilities.rules) {
          logger.warning(`${agent.name}: No compatible MCP servers, and rules not supported`);
        } else if (!hasRules && appliedRules) {
          logger.warning(`${agent.name}: No rules support`);
        } else {
          logger.warning(`${agent.name}: No compatible MCP servers`);
        }
        continue;
      }
      
      // Apply MCP configuration (global or project-specific)
      if (hasMcpServers) {
        if (isGlobal) {
          await agent.applyGlobalMCPConfig(filtered.servers);
        } else {
          await agent.applyMCPConfig(cwd, filtered.servers);
        }
      }
      
      // Apply rules configuration
      let rulesResult = null;
      if (hasRules && appliedRules) {
        if (isGlobal) {
          rulesResult = await agent.applyGlobalRules(appliedRules);
        } else {
          rulesResult = await agent.applyRules(cwd, appliedRules);
        }
      }
      
      results.push({
        agent,
        serversApplied: filtered.servers.length,
        rulesApplied: rulesResult?.rulesApplied || 0,
        transformations: filtered.transformations,
        mcpConfigPath: hasMcpServers ? (isGlobal ? agent.getGlobalMcpPath()! : agent.getNativeMcpPath(cwd)) : null,
        rulesConfigPath: rulesResult?.configPath || null,
        rulesSuccess: rulesResult?.success ?? true
      });
    }

    // Generate the universal TOML file (only for project-level configurations with MCPs)
    let tomlPath: string | null = null;
    if (!isGlobal && mcpParsed.servers.length > 0) {
      tomlPath = await getAgentInitTomlPath(cwd);
      const existingToml = await readFileIfExists(tomlPath);
      
      let finalToml: string;
      if (existingToml) {
        finalToml = TOMLGenerator.mergeTOML(existingToml, mcpParsed.servers);
      } else {
        finalToml = TOMLGenerator.generateTOML(mcpParsed.servers);
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
    
    // Report MCP servers if any
    if (mcpParsed.servers.length > 0) {
      logger.info(`🔥 Applied ${mcpParsed.servers.length} MCP server(s):`);
      
      mcpParsed.servers.forEach(server => {
        logger.info(`  • ${server.name} (${server.type.toUpperCase()})`);
        if (server.type === MCPServerType.STDIO && server.command) {
          logger.info(`    Command: ${server.command} ${server.args?.join(' ') || ''}`);
        } else if (server.url) {
          logger.info(`    URL: ${server.url}`);
        }
      });
    }
    
    // Report rules if any
    if (appliedRules && appliedRules.merged.length > 0) {
      if (mcpParsed.servers.length > 0) logger.info('');
      logger.info(`📋 Applied ${appliedRules.merged.length} rule(s):`);
      
      appliedRules.merged.forEach(rule => {
        logger.info(`  • ${rule}`);
      });
    }
    
    logger.info('');
    if (isGlobal) {
      logger.info('🌍 Global configurations:');
    } else {
      logger.info('🤖 Agent-specific configurations:');
    }
    
    results.forEach(result => {
      const mcpInfo = result.serversApplied > 0 ? `${result.serversApplied} MCP server(s)` : '';
      const rulesInfo = result.rulesApplied > 0 ? `${result.rulesApplied} rule(s)` : '';
      const appliedInfo = [mcpInfo, rulesInfo].filter(Boolean).join(', ');
      
      logger.info(`  • ${result.agent.name}: ${appliedInfo}`);
      if (result.mcpConfigPath) {
        logger.info(`    MCP Config: ${result.mcpConfigPath}`);
      }
      if (result.rulesConfigPath) {
        logger.info(`    Rules Config: ${result.rulesConfigPath}`);
      }
      
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
      logger.error('MCP Configuration Error:');
      logger.error(error.message);
      logger.info('');
      logger.info('For help with the correct syntax, run: agentinit apply');
    } else if (error instanceof RulesParseError) {
      logger.error('Rules Configuration Error:');
      logger.error(error.message);
      logger.info('');
      logger.info('For help with rules syntax, run: agentinit apply');
    } else {
      logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    process.exit(1);
  }
}