/**
 * Example: Using AgentInit as a Library
 *
 * This example demonstrates how to use agentinit as a library
 * to verify MCP servers programmatically.
 */

import { MCPVerifier, MCPServerType, type MCPServerConfig } from '../src/lib/index.js';

async function main() {
  console.log('🔍 AgentInit Library Example\n');

  // Create a verifier instance with 10 second timeout
  const verifier = new MCPVerifier(10000);

  // Define a simple STDIO MCP server config
  const server: MCPServerConfig = {
    name: 'everything',
    type: MCPServerType.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything']
  };

  console.log(`Verifying MCP server: ${server.name}...\n`);

  try {
    // Verify the server
    const result = await verifier.verifyServer(server);

    // Check the result
    if (result.status === 'success') {
      console.log(`✅ Success!`);
      console.log(`Connection time: ${result.connectionTime}ms`);
      console.log(`Tools found: ${result.capabilities?.tools.length || 0}`);
      console.log(`Total tokens: ${result.capabilities?.totalToolTokens || 0}\n`);

      // List the first 5 tools
      if (result.capabilities?.tools) {
        console.log('Sample tools:');
        result.capabilities.tools.slice(0, 5).forEach(tool => {
          const tokens = result.capabilities?.toolTokenCounts?.get(tool.name) || 0;
          console.log(`  • ${tool.name} (${tokens} tokens)`);
        });
      }
    } else {
      console.error(`❌ Verification failed: ${result.status}`);
      console.error(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('Error verifying server:', error);
  }
}

// Run the example
main().catch(console.error);
