import ora from 'ora';
import { green, yellow, red, cyan } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { MCPParser, MCPParseError } from '../core/mcpParser.js';
import { RulesParser, RulesParseError } from '../core/rulesParser.js';
import { TOMLGenerator } from '../core/tomlGenerator.js';
import { readFileIfExists, writeFile, getAgentInitTomlPath } from '../utils/fs.js';
import { AgentManager } from '../core/agentManager.js';
import { MCPFilter } from '../core/mcpFilter.js';
import { MCPVerifier } from '../core/mcpClient.js';
import { MCPServerType, type AppliedRules, type RuleApplicationResult, type RuleSection, type MCPTransformation } from '../types/index.js';
import type { Agent } from '../agents/Agent.js';

// Interface for apply command results
interface ApplyResult {
  agent: Agent;
  serversApplied: number;
  rulesApplied: number;
  rulesTokenCount: number;
  rulesTokenDiff: number;
  totalFileTokens: number;
  existingRules: string[];
  newlyApplied: string[];
  existingCount: number;
  newlyAppliedCount: number;
  appliedSections: RuleSection[];
  transformations: MCPTransformation[];
  mcpConfigPath: string | null;
  rulesConfigPath: string | null;
  rulesSuccess: boolean;
}

// Color utility functions for token display
function colorizeTokenCount(tokenCount: number): string {
  if (tokenCount <= 5000) return green(tokenCount.toString());
  if (tokenCount <= 15000) return yellow(tokenCount.toString());
  if (tokenCount <= 30000) return red(tokenCount.toString()); // Light red approximated with red
  return red(tokenCount.toString()); // Red for >30k
}

function colorizeTokenDiff(diff: number): string {
  if (diff === 0) return '±0';
  if (diff > 0) return green(`+${diff}`);
  return red(`${diff}`); // Already has negative sign
}

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
  
  // Check if --verify-mcp flag is specified
  const verifyMcp = args.includes('--verify-mcp');
  
  if (!hasMcpArgs && !hasRulesArgs) {
    logger.info('Usage: agentinit apply [options]');
    logger.info('');
    logger.info('Options:');
    logger.info('  --client <agent>    Target specific agent (claude, claude-desktop, codex, gemini, cursor)');
    logger.info('  --agent <agent>     Alias for --client');
    logger.info('  --global            Apply configuration globally (requires --agent)');
    logger.info('                      If not specified, auto-detects agents in the project');
    logger.info('  --verify-mcp        Verify MCP servers after configuration');
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
    logger.info('');
    logger.info('  # Verify MCP servers after configuration');
    logger.info('  agentinit apply --verify-mcp \\');
    logger.info('    --mcp-stdio exa "npx -y @exa/mcp-server" \\');
    logger.info('      --env "EXA_API_KEY=YOUR_API_KEY"');
    return;
  }

  const spinner = ora('Parsing configurations...').start();

  try {
    // Parse the MCP arguments (filter out --client, --agent, --global and rules args)
    const mcpArgs = args.filter((arg, index) => {
      // Filter out non-MCP arguments
      if (arg === '--client' || arg === '--agent' || arg === '--global' || arg === '--verify-mcp') return false;
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
          agent.configFiles.forEach(config => 
            logger.info(`  • ${config.path} (${config.type}, ${config.purpose}${config.description ? ': ' + config.description : ''})`)
          );
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
          logger.info(`    Files: ${agent.configFiles.map(c => c.path).join(', ')}`);
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
    const results: ApplyResult[] = [];
    
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
        rulesTokenCount: rulesResult?.tokenCount || 0,
        rulesTokenDiff: rulesResult?.tokenDiff || 0,
        totalFileTokens: rulesResult?.totalFileTokens || 0,
        existingRules: rulesResult?.existingRules || [],
        newlyApplied: rulesResult?.newlyApplied || [],
        existingCount: rulesResult?.existingCount || 0,
        newlyAppliedCount: rulesResult?.newlyAppliedCount || 0,
        appliedSections: rulesResult?.mergedSections || [],
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

    // Verify MCP servers if requested and MCP servers were configured
    if (verifyMcp && mcpParsed.servers.length > 0) {
      logger.info('');
      const verifySpinner = ora(`Verifying ${mcpParsed.servers.length} MCP server(s)...`).start();
      
      try {
        const verifier = new MCPVerifier();
        const verificationResults = await verifier.verifyServers(mcpParsed.servers);
        
        const successCount = verificationResults.filter(r => r.status === 'success').length;
        const errorCount = verificationResults.filter(r => r.status === 'error').length;
        const timeoutCount = verificationResults.filter(r => r.status === 'timeout').length;
        
        if (successCount === verificationResults.length) {
          verifySpinner.succeed(`All ${verificationResults.length} MCP server(s) verified successfully!`);
        } else if (successCount > 0) {
          verifySpinner.warn(`${successCount}/${verificationResults.length} MCP server(s) verified successfully`);
        } else {
          verifySpinner.fail(`Failed to verify any MCP servers`);
        }
        
        logger.info('');
        logger.info('MCP Verification Results:');
        logger.info('');
        
        const formattedOutput = verifier.formatResults(verificationResults);
        console.log(formattedOutput);
        
        if (successCount < verificationResults.length) {
          logger.info('For troubleshooting, run: agentinit verify_mcp --all');
        }
        
      } catch (error) {
        verifySpinner.fail('MCP verification failed');
        logger.error(`Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
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
        if (server.type === 'stdio' && server.command) {
          logger.info(`    Command: ${server.command} ${server.args?.join(' ') || ''}`);
        } else if (server.url) {
          logger.info(`    URL: ${server.url}`);
        }
      });
    }
    
    // Report rules if any
    if (appliedRules && appliedRules.merged.length > 0) {
      if (mcpParsed.servers.length > 0) logger.info('');
      
      // Calculate totals across all agents
      const totalExisting = results.reduce((sum, r) => sum + (r.existingCount || 0), 0);
      const totalNewlyApplied = results.reduce((sum, r) => sum + (r.newlyAppliedCount || 0), 0);
      
      // Get unique sections across all results
      const allSections = results.flatMap(r => r.appliedSections || []);
      const uniqueSections = Array.from(
        new Map(allSections.map(s => [s.templateId, s])).values()
      );
      
      // Show existing sections (if any)
      if (totalExisting > 0) {
        const existingSectionCount = uniqueSections.filter(section => {
          return section.rules.some((rule: string) => 
            results.some(r => r.existingRules?.includes(rule))
          );
        }).length;
        
        logger.info(`📋 Already exists (${existingSectionCount} sections):`);
        uniqueSections.forEach(section => {
          const existingRulesInSection = section.rules.filter((rule: string) =>
            results.some(r => r.existingRules?.includes(rule))
          );
          if (existingRulesInSection.length > 0) {
            logger.info(`  • ${section.templateName} (${existingRulesInSection.length} rules)`);
          }
        });
      }
      
      // Show newly applied sections (if any)
      if (totalNewlyApplied > 0) {
        if (totalExisting > 0) logger.info('');
        
        const newlySectionCount = uniqueSections.filter(section => {
          return section.rules.some((rule: string) => 
            results.some(r => r.newlyApplied?.includes(rule))
          );
        }).length;
        
        logger.info(`📋 Applied (${newlySectionCount} sections):`);
        uniqueSections.forEach(section => {
          const newRulesInSection = section.rules.filter((rule: string) =>
            results.some(r => r.newlyApplied?.includes(rule))
          );
          if (newRulesInSection.length > 0) {
            logger.info(`  • ${section.templateName} (${newRulesInSection.length} rules)`);
          }
        });
      }
    }
    
    logger.info('');
    if (isGlobal) {
      logger.info('🌍 Agents:');
    } else {
      logger.info('🤖 Agents:');
    }
    
    const totalTokens = results.reduce((sum, result) => sum + (result.rulesTokenCount || 0), 0);
    
    results.forEach(result => {
      const mcpInfo = result.serversApplied > 0 ? `${result.serversApplied} MCP server(s)` : '';
      const rulesInfo = result.rulesApplied > 0 ? `${result.rulesApplied} rule(s)` : '';
      const appliedInfo = [mcpInfo, rulesInfo].filter(Boolean).join(', ');
      
      logger.info(`- ${result.agent.name}`);
      
      // Show detailed token information for rules
      if (result.rulesApplied > 0) {
        if (result.totalFileTokens && result.totalFileTokens > 0) {
          const totalColored = colorizeTokenCount(result.totalFileTokens);
          const totalDiff = colorizeTokenDiff(result.rulesTokenDiff || 0);
          logger.info(`  Total File: ${totalColored} tokens (${totalDiff})`);
        }
        
        if (result.rulesConfigPath) {
          logger.info(`  Config: ${result.rulesConfigPath}`);
        }
        
        // Show warning if file is overweight
        if (result.totalFileTokens && result.totalFileTokens > 30000) {
          const configName = result.rulesConfigPath?.includes('CLAUDE') ? 'CLAUDE.md' : 
                           result.rulesConfigPath?.includes('.cursorrules') ? '.cursorrules' :
                           'config file';
          logger.warning(`  ⚠️ ${configName} is overweight (>30k tokens). Consider reducing rules.`);
        }
      } else if (result.mcpConfigPath) {
        logger.info(`  MCP Config: ${result.mcpConfigPath}`);
      }
      
      if (result.transformations.length > 0) {
        logger.info(`  ⚡ ${result.transformations.length} server(s) transformed for compatibility`);
        result.transformations.forEach(transform => {
          logger.info(`    - ${transform.original.name}: ${transform.reason}`);
        });
      }
    });

    // Show total token count if multiple agents with rules
    if (totalTokens > 0 && results.filter(r => r.rulesApplied > 0).length > 1) {
      logger.info('');
      logger.info(`📊 Total rules token usage: ${totalTokens} tokens`);
    }

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