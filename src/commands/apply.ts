import ora from 'ora';
import { logger } from '../utils/logger.js';
import { MCPParser } from '../core/mcpParser.js';
import { TOMLGenerator } from '../core/tomlGenerator.js';
import { readFileIfExists, writeFile, getAgentInitTomlPath } from '../utils/fs.js';
import { MCPServerType } from '../types/index.js';

export async function applyCommand(args: string[]): Promise<void> {
  const cwd = process.cwd();
  
  logger.title('🔧 AgentInit - Apply Configuration');
  
  // Check if any MCP arguments are present
  const hasMcpArgs = args.some(arg => arg.startsWith('--mcp-'));
  
  if (!hasMcpArgs) {
    logger.info('Usage: agentinit apply [options]');
    logger.info('');
    logger.info('MCP Configuration Examples:');
    logger.info('  # STDIO MCP with args');
    logger.info('  agentinit apply \\');
    logger.info('    --mcp-stdio context7 "npx -y @upstash/context7-mcp" --args "--api-key=YOUR_API_KEY"');
    logger.info('');
    logger.info('  # HTTP MCP with auth');
    logger.info('  agentinit apply \\');
    logger.info('    --mcp-http github "https://api.githubcopilot.com/mcp/" --auth "Bearer YOUR_GITHUB_PAT"');
    logger.info('');
    logger.info('  # SSE MCP');
    logger.info('  agentinit apply \\');
    logger.info('    --mcp-sse notion_events "https://mcp.notion.com/sse"');
    logger.info('');
    logger.info('  # Multiple MCPs');
    logger.info('  agentinit apply \\');
    logger.info('    --mcp-stdio supabase "npx -y @supabase/mcp-server-supabase@latest" \\');
    logger.info('      --args "--read-only --project-ref=<project-ref>" \\');
    logger.info('      --env "SUPABASE_ACCESS_TOKEN=<personal-access-token>" \\');
    logger.info('    --mcp-http notion_api "https://mcp.notion.com/mcp"');
    return;
  }

  const spinner = ora('Parsing configurations...').start();

  try {
    // Parse the MCP arguments
    const parsed = MCPParser.parseArguments(args);
    
    if (parsed.servers.length === 0) {
      spinner.warn('No MCP servers found in arguments');
      logger.info('Use --help for usage examples');
      return;
    }

    spinner.text = 'Generating TOML configuration...';

    // Get the path for the TOML file
    const tomlPath = await getAgentInitTomlPath(cwd);
    
    // Check if existing TOML exists
    const existingToml = await readFileIfExists(tomlPath);
    
    let finalToml: string;
    if (existingToml) {
      // Merge with existing configuration
      finalToml = TOMLGenerator.mergeTOML(existingToml, parsed.servers);
      spinner.text = 'Merging with existing configuration...';
    } else {
      // Generate new configuration
      finalToml = TOMLGenerator.generateTOML(parsed.servers);
    }

    // Write the TOML file
    await writeFile(tomlPath, finalToml);

    spinner.succeed('Configuration applied successfully!');
    
    logger.info(`📁 Configuration saved to: ${tomlPath}`);
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
    logger.info('Next steps:');
    logger.info('  1. Review the generated configuration in .agentinit/agentinit.toml');
    logger.info('  2. Update environment variables with your actual API keys');
    logger.info('  3. Configure your AI coding agent to use this MCP configuration');

  } catch (error) {
    spinner.fail('Failed to apply configuration');
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}