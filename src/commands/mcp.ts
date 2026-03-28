import { Command } from 'commander';
import ora from 'ora';
import { green, cyan, yellow, red } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { MCPParser, MCPParseError } from '../core/mcpParser.js';
import { MCPVerifier } from '../core/mcpClient.js';
import { MCPFilter } from '../core/mcpFilter.js';
import { AgentManager } from '../core/agentManager.js';
import { DEFAULT_CONNECTION_TIMEOUT_MS } from '../constants/index.js';
import type { MCPServerConfig } from '../types/index.js';
import type { Agent } from '../agents/Agent.js';

/**
 * Options that `mcp add` recognizes and must be stripped before
 * passing the remaining argv to MCPParser.
 *
 * Map key   = the flag itself
 * Map value = true if the flag takes a value argument, false if boolean
 */
const KNOWN_ADD_OPTIONS: Record<string, boolean> = {
  '--agent': true,
  '--global': false,
  '--verify': false,
  '--timeout': true,
};

/**
 * Strip known CLI options (and their values) from the raw arg list
 * so that only `--mcp-*` flags and their modifiers remain.
 */
function filterMcpArgs(args: string[]): string[] {
  const filtered: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i]!;
    const meta = KNOWN_ADD_OPTIONS[arg];

    if (meta !== undefined) {
      // Skip the flag itself
      i++;
      // If it takes a value, also skip the next token
      if (meta && i < args.length) {
        i++;
      }
      continue;
    }

    filtered.push(arg);
    i++;
  }

  return filtered;
}

/**
 * Resolve the list of agents to operate on.
 *
 * - If `agentIds` is provided, look up each one explicitly.
 * - If `isGlobal` is set without agents, error out (global requires explicit agent).
 * - Otherwise auto-detect agents in the current project.
 */
async function resolveAgents(
  agentManager: AgentManager,
  agentIds: string[] | undefined,
  isGlobal: boolean,
  cwd: string
): Promise<{ agent: Agent; isGlobal: boolean }[]> {
  if (agentIds && agentIds.length > 0) {
    const results: { agent: Agent; isGlobal: boolean }[] = [];
    for (const id of agentIds) {
      const agent = agentManager.getAgentById(id);
      if (!agent) {
        logger.error(`Unknown agent: ${id}`);
        logger.info(`Supported agents: ${agentManager.getSupportedAgentIds().join(', ')}`);
        process.exit(1);
      }
      if (isGlobal && !agent.supportsGlobalConfig()) {
        logger.error(`Agent ${agent.name} does not support global configuration`);
        process.exit(1);
      }
      if (!isGlobal) {
        const detection = await agent.detectPresence(cwd);
        if (!detection) {
          logger.warning(`Agent ${id} not detected in project, skipping`);
          continue;
        }
      }
      results.push({ agent, isGlobal });
    }
    return results;
  }

  if (isGlobal) {
    logger.error('--global requires --agent to specify target agent(s)');
    process.exit(1);
  }

  // Auto-detect
  const detected = await agentManager.detectAgents(cwd);
  if (detected.length === 0) {
    logger.warning('No AI coding agents detected in this project');
    logger.info('Supported agents:');
    agentManager.getAllAgents().forEach(a => {
      logger.info(`  - ${a.name} (${a.id})`);
    });
    logger.info('');
    logger.info('To target a specific agent, use: --agent <agent-id>');
    return [];
  }
  return detected.map(d => ({ agent: d.agent, isGlobal: false }));
}

// ---------------------------------------------------------------------------
// Subcommand: mcp add
// ---------------------------------------------------------------------------
function registerAddCommand(mcp: Command): void {
  mcp
    .command('add')
    .description('Add MCP server(s) to agent configurations')
    .allowUnknownOption(true)
    .option('--agent <agents...>', 'Target specific agent(s)')
    .option('-g, --global', 'Apply to global configuration')
    .option('--verify', 'Verify MCP servers after adding')
    .option('--timeout <ms>', 'Connection timeout for verification (ms)')
    .action(async (options: any, command: any) => {
      const cwd = process.cwd();

      // Extract raw args that come after "mcp add"
      const allArgs: string[] = command.parent.parent.rawArgs;
      const addIdx = allArgs.indexOf('add');
      if (addIdx < 0) {
        logger.error('Internal error: could not locate "add" in raw arguments');
        process.exit(1);
      }
      const rawArgs = allArgs.slice(addIdx + 1);

      // Strip known options so only --mcp-* flags remain
      const mcpArgs = filterMcpArgs(rawArgs);

      if (mcpArgs.length === 0 || !mcpArgs.some(a => a.startsWith('--mcp-'))) {
        logger.info('Usage: agentinit mcp add [options] --mcp-stdio|--mcp-http|--mcp-sse <name> <command|url> [modifiers]');
        logger.info('');
        logger.info('Options:');
        logger.info('  --agent <agents...>   Target specific agent(s)');
        logger.info('  -g, --global          Apply to global configuration');
        logger.info('  --verify              Verify MCP servers after adding');
        logger.info(`  --timeout <ms>        Verification timeout (default: ${DEFAULT_CONNECTION_TIMEOUT_MS})`);
        logger.info('');
        logger.info('Examples:');
        logger.info('  agentinit mcp add --mcp-stdio exa "npx -y @exa/mcp-server" --env "EXA_API_KEY=key"');
        logger.info('  agentinit mcp add --agent claude --mcp-http github "https://api.github.com/mcp" --auth "Bearer token"');
        logger.info('  agentinit mcp add --global --agent claude --mcp-stdio fs "npx -y @modelcontextprotocol/server-filesystem" --args "/home"');
        return;
      }

      const spinner = ora('Parsing MCP configuration...').start();

      try {
        const parsed = MCPParser.parseArguments(mcpArgs);

        if (parsed.servers.length === 0) {
          spinner.warn('No MCP servers found in arguments');
          return;
        }

        spinner.text = 'Resolving target agents...';

        const agentManager = new AgentManager();
        const isGlobal = !!options.global;
        const targets = await resolveAgents(agentManager, options.agent, isGlobal, cwd);

        if (targets.length === 0) {
          spinner.warn('No target agents resolved');
          return;
        }

        let totalApplied = 0;

        for (const { agent, isGlobal: global } of targets) {
          spinner.text = `Applying to ${agent.name}...`;

          const filtered = MCPFilter.filterForAgent(agent, parsed.servers);

          if (filtered.servers.length === 0) {
            logger.warning(`${agent.name}: No compatible MCP servers`);
            continue;
          }

          if (global) {
            await agent.applyGlobalMCPConfig(filtered.servers);
          } else {
            await agent.applyMCPConfig(cwd, filtered.servers);
          }

          totalApplied += filtered.servers.length;

          const configPath = global
            ? agent.getGlobalMcpPath()
            : agent.getNativeMcpPath(cwd);

          logger.info(`  ${green('+')} ${agent.name}: ${filtered.servers.length} server(s) added`);
          if (configPath) {
            logger.info(`    Config: ${configPath}`);
          }

          if (filtered.transformations.length > 0) {
            filtered.transformations.forEach(t => {
              logger.info(`    ${yellow('~')} ${t.original.name}: ${t.reason}`);
            });
          }
        }

        if (totalApplied === 0) {
          spinner.warn('No servers were applied (all filtered out)');
        } else {
          spinner.succeed(`Added ${totalApplied} MCP server(s)`);

          // List what was added
          parsed.servers.forEach(server => {
            const typeLabel = server.type.toUpperCase();
            if (server.type === 'stdio' && server.command) {
              logger.info(`  ${cyan(server.name)} (${typeLabel}): ${server.command} ${server.args?.join(' ') || ''}`);
            } else if (server.url) {
              logger.info(`  ${cyan(server.name)} (${typeLabel}): ${server.url}`);
            }
          });
        }

        // Verify if requested
        if (options.verify && parsed.servers.length > 0) {
          logger.info('');
          const timeout = options.timeout ? parseInt(options.timeout, 10) : undefined;
          await runVerification(parsed.servers, timeout);
        }
      } catch (error) {
        spinner.fail('Failed to add MCP servers');
        if (error instanceof MCPParseError) {
          logger.error(error.message);
        } else {
          logger.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Subcommand: mcp list (alias: ls)
// ---------------------------------------------------------------------------
function registerListCommand(mcp: Command): void {
  mcp
    .command('list')
    .alias('ls')
    .description('List configured MCP servers')
    .option('--agent <agents...>', 'Target specific agent(s)')
    .option('-g, --global', 'List global configuration')
    .action(async (options: any) => {
      const cwd = process.cwd();
      const agentManager = new AgentManager();
      const isGlobal = !!options.global;

      const spinner = ora('Reading MCP configurations...').start();

      try {
        const targets = await resolveAgents(agentManager, options.agent, isGlobal, cwd);

        if (targets.length === 0) {
          spinner.warn('No target agents resolved');
          return;
        }

        spinner.stop();

        let totalServers = 0;

        for (const { agent, isGlobal: global } of targets) {
          let servers: MCPServerConfig[] = [];

          try {
            if (global) {
              servers = await agent.getGlobalMCPServers();
            } else {
              servers = await agent.getMCPServers(cwd);
            }
          } catch {
            // Agent may not have MCP config yet
          }

          const scope = global ? ' (global)' : '';
          logger.subtitle(`${agent.name}${scope}:`);

          if (servers.length === 0) {
            logger.info('  No MCP servers configured');
          } else {
            for (const server of servers) {
              const typeLabel = server.type.toUpperCase();
              if (server.type === 'stdio' && server.command) {
                logger.info(`  ${cyan(server.name)} (${typeLabel})`);
                logger.info(`    Command: ${server.command} ${server.args?.join(' ') || ''}`);
              } else if (server.url) {
                // Sanitize URL
                let sanitized: string;
                try {
                  const u = new URL(server.url);
                  u.username = '';
                  u.password = '';
                  u.search = '';
                  sanitized = u.toString();
                } catch {
                  sanitized = server.url.split('?')[0] || server.url;
                }
                logger.info(`  ${cyan(server.name)} (${typeLabel})`);
                logger.info(`    URL: ${sanitized}`);
              } else {
                logger.info(`  ${cyan(server.name)} (${typeLabel})`);
              }

              if (server.env && Object.keys(server.env).length > 0) {
                const keys = Object.keys(server.env).join(', ');
                logger.info(`    Env: ${keys}`);
              }
            }
          }

          totalServers += servers.length;
          logger.info('');
        }

        logger.info(`Total: ${totalServers} MCP server(s) across ${targets.length} agent(s)`);
      } catch (error) {
        spinner.fail('Failed to list MCP servers');
        logger.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Subcommand: mcp remove <name>
// ---------------------------------------------------------------------------
function registerRemoveCommand(mcp: Command): void {
  mcp
    .command('remove <name>')
    .description('Remove an MCP server by name')
    .option('--agent <agents...>', 'Target specific agent(s)')
    .option('-g, --global', 'Remove from global configuration')
    .action(async (name: string, options: any) => {
      const cwd = process.cwd();
      const agentManager = new AgentManager();
      const isGlobal = !!options.global;

      const spinner = ora(`Removing MCP server "${name}"...`).start();

      try {
        const targets = await resolveAgents(agentManager, options.agent, isGlobal, cwd);

        if (targets.length === 0) {
          spinner.warn('No target agents resolved');
          return;
        }

        let removedCount = 0;
        let failedCount = 0;

        for (const { agent, isGlobal: global } of targets) {
          try {
            let removed: boolean;
            if (global) {
              removed = await agent.removeGlobalMCPServer(name);
            } else {
              removed = await agent.removeMCPServer(cwd, name);
            }

            if (removed) {
              removedCount++;
              logger.info(`  ${green('-')} ${agent.name}: removed "${name}"`);
            } else {
              logger.info(`  ${yellow('~')} ${agent.name}: "${name}" not found`);
            }
          } catch (err) {
            failedCount++;
            logger.info(`  ${red('x')} ${agent.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
          }
        }

        if (removedCount > 0) {
          spinner.succeed(`Removed "${name}" from ${removedCount} agent(s)`);
        } else if (failedCount > 0) {
          spinner.fail(`Failed to remove "${name}"`);
        } else {
          spinner.warn(`"${name}" was not found in any agent configuration`);
        }
      } catch (error) {
        spinner.fail(`Failed to remove MCP server "${name}"`);
        logger.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Subcommand: mcp verify
// ---------------------------------------------------------------------------
function registerVerifyCommand(mcp: Command): void {
  mcp
    .command('verify')
    .description('Verify MCP server connectivity and capabilities')
    .allowUnknownOption(true)
    .option('--all', 'Verify all configured MCP servers')
    .option('--name <name>', 'Verify a specific MCP server by name')
    .option('--timeout <ms>', 'Connection timeout in milliseconds')
    .action(async (options: any, command: any) => {
      const cwd = process.cwd();

      // Determine if raw MCP args were provided for direct verification
      const allArgs: string[] = command.parent.parent.rawArgs;
      const verifyIdx = allArgs.indexOf('verify');
      const rawArgs = verifyIdx >= 0 ? allArgs.slice(verifyIdx + 1) : [];
      const hasMcpArgs = rawArgs.some((a: string) => a.startsWith('--mcp-'));

      const timeout = options.timeout ? parseInt(options.timeout, 10) : undefined;

      // Validate mutually exclusive options
      if (hasMcpArgs && (options.all || options.name)) {
        logger.error('Cannot mix direct MCP server args (--mcp-*) with --all or --name');
        process.exit(1);
      }

      if (options.all && options.name) {
        logger.error('Cannot use --all and --name together');
        process.exit(1);
      }

      // If no options at all, show usage
      if (!hasMcpArgs && !options.all && !options.name) {
        logger.info('Usage: agentinit mcp verify [options]');
        logger.info('');
        logger.info('Verify existing configurations:');
        logger.info('  --all                  Verify all configured MCP servers');
        logger.info('  --name <name>          Verify a specific MCP server by name');
        logger.info(`  --timeout <ms>         Connection timeout (default: ${DEFAULT_CONNECTION_TIMEOUT_MS})`);
        logger.info('');
        logger.info('Verify a server directly:');
        logger.info('  --mcp-stdio <name> <command>   Verify STDIO server');
        logger.info('  --mcp-http <name> <url>        Verify HTTP server');
        logger.info('  --mcp-sse <name> <url>         Verify SSE server');
        logger.info('');
        logger.info('Examples:');
        logger.info('  agentinit mcp verify --all');
        logger.info('  agentinit mcp verify --name exa');
        logger.info('  agentinit mcp verify --mcp-stdio everything "npx -y @modelcontextprotocol/server-everything"');
        return;
      }

      let serversToVerify: MCPServerConfig[] = [];
      let serverSources: Array<{ server: MCPServerConfig; agentName: string; configPath: string }> = [];

      const spinner = ora('Preparing verification...').start();

      try {
        if (hasMcpArgs) {
          // Direct verification: parse --mcp-* args from the raw args
          const mcpOnlyArgs = filterMcpArgs(rawArgs);
          const parsed = MCPParser.parseArguments(mcpOnlyArgs);

          if (parsed.servers.length === 0) {
            spinner.warn('No MCP servers found in arguments');
            return;
          }

          serversToVerify = parsed.servers;
          spinner.text = `Verifying ${serversToVerify.length} MCP server(s) from arguments...`;
        } else {
          // Existing configuration verification
          spinner.text = 'Detecting agents and MCP configurations...';

          const agentManager = new AgentManager();
          const detectedAgents = await agentManager.detectAgents(cwd);

          if (detectedAgents.length === 0) {
            spinner.warn('No AI coding agents detected in this project');
            logger.info('Run `agentinit detect` to see which agents are supported');
            return;
          }

          // Collect servers from all detected agents
          const allServers: MCPServerConfig[] = [];
          const allSources: typeof serverSources = [];

          for (const { agent } of detectedAgents) {
            try {
              const servers = await agent.getMCPServers(cwd);
              for (const server of servers) {
                allServers.push(server);
                allSources.push({
                  server,
                  agentName: agent.name,
                  configPath: agent.getNativeMcpPath(cwd),
                });
              }
            } catch {
              // Agent may not have MCP config
            }
          }

          if (allServers.length === 0) {
            spinner.warn('No MCP servers found in any agent configuration');
            logger.info('Use `agentinit mcp add` to add MCP servers');
            return;
          }

          if (options.all) {
            serversToVerify = allServers;
            serverSources = allSources;
          } else if (options.name) {
            const matchName = (options.name as string).toLowerCase();
            serversToVerify = allServers.filter(s => s.name.toLowerCase() === matchName);
            serverSources = allSources.filter(s => s.server.name.toLowerCase() === matchName);

            if (serversToVerify.length === 0) {
              spinner.fail(`MCP server "${options.name}" not found`);
              logger.info('Available MCP servers:');
              allServers.forEach(s => {
                const src = allSources.find(x => x.server.name === s.name);
                logger.info(`  - ${s.name} (${s.type}) [${src?.agentName || 'unknown'}]`);
              });
              return;
            }
          }

          spinner.text = `Verifying ${serversToVerify.length} MCP server(s)...`;
        }

        // Run verification
        await runVerification(serversToVerify, timeout, spinner, serverSources);
      } catch (error) {
        spinner.fail('Verification failed');
        if (error instanceof MCPParseError) {
          logger.error(error.message);
        } else {
          logger.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Shared verification helper
// ---------------------------------------------------------------------------
async function runVerification(
  servers: MCPServerConfig[],
  timeout?: number,
  spinner?: ReturnType<typeof ora>,
  serverSources?: Array<{ server: MCPServerConfig; agentName: string; configPath: string }>
): Promise<void> {
  const ownSpinner = spinner || ora(`Verifying ${servers.length} MCP server(s)...`).start();

  const verifier = new MCPVerifier(timeout);
  const results = await verifier.verifyServers(servers, timeout);

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const timeoutCount = results.filter(r => r.status === 'timeout').length;

  if (successCount === results.length) {
    ownSpinner.succeed(`All ${results.length} MCP server(s) verified successfully!`);
  } else if (successCount > 0) {
    ownSpinner.warn(`${successCount}/${results.length} MCP server(s) verified successfully`);
  } else {
    ownSpinner.fail('Failed to verify any MCP servers');
  }

  logger.info('');
  const formattedOutput = verifier.formatResults(results);
  console.log(formattedOutput);

  // Summary for multiple servers
  if (results.length > 1) {
    logger.info('Summary:');
    logger.info(`  Successful: ${successCount}`);
    if (errorCount > 0) logger.info(`  Failed: ${errorCount}`);
    if (timeoutCount > 0) logger.info(`  Timeout: ${timeoutCount}`);
    logger.info('');
  }

  // Show source info for failed servers when we have sources
  if (serverSources && serverSources.length > 0) {
    const failed = results.filter(r => r.status !== 'success');
    if (failed.length > 0) {
      logger.info('Configuration Sources:');
      for (const result of failed) {
        const src = serverSources.find(s => s.server.name === result.server.name);
        if (src) {
          logger.info(`  - ${result.server.name}: ${src.configPath} (${src.agentName})`);
        }
      }
      logger.info('');
    }
  }

  // Troubleshooting tips for failures
  if (successCount < results.length) {
    logger.info('Troubleshooting:');
    logger.info('  1. Ensure MCP server packages are installed');
    logger.info('  2. Check environment variables are set correctly');
    logger.info('  3. Verify network connectivity for HTTP/SSE servers');
    logger.info('  4. Try increasing timeout with --timeout <ms>');
  }
}

// ---------------------------------------------------------------------------
// Main registration
// ---------------------------------------------------------------------------
export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('Manage MCP server configurations');

  registerAddCommand(mcp);
  registerListCommand(mcp);
  registerRemoveCommand(mcp);
  registerVerifyCommand(mcp);
}
