/**
 * AgentInit Library Entry Point
 *
 * This is the main entry point for the AgentInit library.
 * For CLI usage, see src/cli.ts
 *
 * @example
 * ```typescript
 * import { MCPVerifier, MCPServerType } from 'agentinit';
 *
 * const verifier = new MCPVerifier();
 * const result = await verifier.verifyServer({
 *   name: 'my-server',
 *   type: MCPServerType.STDIO,
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-everything']
 * });
 * ```
 */

export * from './lib/index.js';
