import ora from 'ora';
import { logger } from '../utils/logger.js';
import { MCPVerifier } from '../core/mcpClient.js';
import { MCPParser, MCPParseError } from '../core/mcpParser.js';
import { AgentManager } from '../core/agentManager.js';
import type { MCPServerConfig } from '../types/index.js';

interface VerifyMcpOptions {
  mcpName?: string;
  all?: boolean;
  timeout?: number;
}

export async function verifyMcpCommand(args: string[]): Promise<void> {
  const cwd = process.cwd();
  
  logger.title('🔍 AgentInit - MCP Verification');
  
  // Parse command line options
  const hasAll = args.includes('--all');
  const mcpNameIndex = args.findIndex(arg => arg === '--mcp-name');
  const mcpName = mcpNameIndex >= 0 && mcpNameIndex + 1 < args.length ? args[mcpNameIndex + 1] : null;
  const timeoutIndex = args.findIndex(arg => arg === '--timeout');
  const timeout = timeoutIndex >= 0 && timeoutIndex + 1 < args.length ? parseInt(args[timeoutIndex + 1] || '') : undefined;
  
  // Check if MCP configuration arguments are present
  const hasMcpArgs = args.some(arg => arg.startsWith('--mcp-'));
  
  // Validate options
  if (mcpName && hasAll) {
    logger.error('Cannot use --mcp-name and --all together. Choose one option.');
    process.exit(1);
  }
  
  if (hasMcpArgs && (mcpName || hasAll)) {
    logger.error('Cannot mix direct MCP configuration with --mcp-name or --all. Choose one approach.');
    process.exit(1);
  }
  
  if (!mcpName && !hasAll && !hasMcpArgs) {
    logger.info('Usage: agentinit verify_mcp [options]');
    logger.info('');
    logger.info('Verify existing configurations:');
    logger.info('  --mcp-name <name>    Verify specific MCP server by name');
    logger.info('  --all                Verify all configured MCP servers');
    logger.info('  --timeout <ms>       Connection timeout in milliseconds (default: 10000)');
    logger.info('');
    logger.info('Verify direct MCP configuration:');
    logger.info('  --mcp-stdio <name> <command>     Verify STDIO MCP server');
    logger.info('  --mcp-http <name> <url>          Verify HTTP MCP server');
    logger.info('  --mcp-sse <name> <url>           Verify SSE MCP server');
    logger.info('  --args <args>                    Additional arguments for server');
    logger.info('  --env <env_vars>                 Environment variables for server');
    logger.info('  --auth <token>                   Authentication token for HTTP/SSE');
    logger.info('');
    logger.info('Examples:');
    logger.info('  # Verify existing configurations');
    logger.info('  agentinit verify_mcp --all');
    logger.info('  agentinit verify_mcp --mcp-name exa');
    logger.info('');
    logger.info('  # Verify direct configuration');
    logger.info('  agentinit verify_mcp --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything"');
    logger.info('  agentinit verify_mcp --mcp-http github "https://api.github.com/mcp" --auth "Bearer token"');
    return;
  }

  let spinner;
  let serversToVerify: MCPServerConfig[] = [];
  let filteredSources: Array<{ server: MCPServerConfig; agent: string; configPath: string }> = [];

  try {
    if (hasMcpArgs) {
      // Handle direct MCP configuration
      spinner = ora('Parsing MCP configuration...').start();
      
      // Filter out non-MCP arguments
      const mcpArgs = args.filter((arg, index) => {
        if (arg === '--mcp-name' || arg === '--all' || arg === '--timeout') return false;
        if (index > 0 && (args[index - 1] === '--mcp-name' || args[index - 1] === '--timeout')) return false;
        return true;
      });
      
      // Parse MCP configuration
      const mcpParsed = MCPParser.parseArguments(mcpArgs);
      serversToVerify = mcpParsed.servers;
      
      if (serversToVerify.length === 0) {
        spinner.warn('No MCP servers found in arguments');
        logger.info('Use --mcp-stdio, --mcp-http, or --mcp-sse to specify servers');
        return;
      }
      
      spinner.text = `Verifying ${serversToVerify.length} MCP server(s) from arguments...`;
      
    } else {
      // Handle existing configuration verification
      spinner = ora('Detecting agents and MCP configurations...').start();
      
      // Initialize agent manager and detect agents
      const agentManager = new AgentManager();
      const detectedAgents = await agentManager.detectAgents(cwd);

      if (detectedAgents.length === 0) {
        spinner.warn('No AI coding agents detected in this project');
        logger.info('Run `agentinit detect` to see which agents are supported');
        return;
      }

      // Collect all MCP servers from detected agents
      const allMcpServers: MCPServerConfig[] = [];
      const serverSources: Array<{ server: MCPServerConfig; agent: string; configPath: string }> = [];

      for (const detection of detectedAgents) {
        const { agent } = detection;
        
        // Get MCP configuration for this agent
        try {
          const mcpServers = await agent.getMCPServers(cwd);
          for (const server of mcpServers) {
            allMcpServers.push(server);
            serverSources.push({
              server,
              agent: agent.name,
              configPath: agent.getNativeMcpPath(cwd)
            });
          }
        } catch (error) {
          // Agent might not have MCP configuration, continue
          continue;
        }
      }

      if (allMcpServers.length === 0) {
        spinner.warn('No MCP servers found in any agent configuration');
        logger.info('Use `agentinit apply` to add MCP servers to your project');
        return;
      }

      // Filter servers based on options

      if (hasAll) {
        serversToVerify = allMcpServers;
        filteredSources = serverSources;
        spinner.text = `Verifying ${serversToVerify.length} MCP server(s)...`;
      } else if (mcpName) {
        const matchingServers = allMcpServers.filter(server => 
          server.name.toLowerCase() === mcpName.toLowerCase()
        );
      
        if (matchingServers.length === 0) {
          spinner.fail(`MCP server "${mcpName}" not found`);
          logger.info('Available MCP servers:');
          allMcpServers.forEach(server => {
            const source = serverSources.find(s => s.server.name === server.name);
            logger.info(`  • ${server.name} (${server.type}) - ${source?.agent || 'unknown'}`);
          });
          return;
        }
        
        serversToVerify = matchingServers;
        filteredSources = serverSources.filter(s => 
          matchingServers.some(server => server.name === s.server.name)
        );
        spinner.text = `Verifying MCP server "${mcpName}"...`;
      }
    }

    // Initialize verifier and verify servers
    const verifier = new MCPVerifier(timeout);
    const results = await verifier.verifyServers(serversToVerify, timeout);

    // Count results
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const timeoutCount = results.filter(r => r.status === 'timeout').length;

    // Update spinner based on results
    if (successCount === results.length) {
      spinner.succeed(`All ${results.length} MCP server(s) verified successfully!`);
    } else if (successCount > 0) {
      spinner.warn(`${successCount}/${results.length} MCP server(s) verified successfully`);
    } else {
      spinner.fail(`Failed to verify any MCP servers`);
    }

    logger.info('');
    logger.info('Verification Results:');
    logger.info('');

    // Display formatted results
    const formattedOutput = verifier.formatResults(results);
    console.log(formattedOutput);

    // Show summary
    if (results.length > 1) {
      logger.info('Summary:');
      logger.info(`  ✅ Successful: ${successCount}`);
      if (errorCount > 0) {
        logger.info(`  ❌ Failed: ${errorCount}`);
      }
      if (timeoutCount > 0) {
        logger.info(`  ⏱️  Timeout: ${timeoutCount}`);
      }
      logger.info('');
    }

    // Show source information for failed servers (only for existing configuration mode)
    if (!hasMcpArgs) {
      const failedServers = results.filter(r => r.status !== 'success');
      if (failedServers.length > 0) {
        logger.info('Configuration Sources:');
        failedServers.forEach(result => {
          const source = filteredSources.find(s => s.server.name === result.server.name);
          if (source) {
            logger.info(`  • ${result.server.name}: ${source.configPath} (${source.agent})`);
          }
        });
        logger.info('');
      }
    }

    // Show next steps for failed verifications
    if (successCount < results.length) {
      logger.info('Troubleshooting Tips:');
      logger.info('  1. Ensure MCP server packages are installed');
      logger.info('  2. Check environment variables are set correctly');
      logger.info('  3. Verify network connectivity for HTTP/SSE servers');
      logger.info('  4. Try increasing timeout with --timeout <ms>');
      logger.info('  5. Check agent configuration files for syntax errors');
    }

  } catch (error) {
    if (spinner) {
      spinner.fail('Failed to verify MCP servers');
    }
    
    if (error instanceof MCPParseError) {
      logger.error('MCP Configuration Error:');
      logger.error(error.message);
      logger.info('');
      logger.info('For help with the correct syntax, run: agentinit verify_mcp');
    } else {
      logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    process.exit(1);
  }
}