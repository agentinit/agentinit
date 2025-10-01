/**
 * MCP Verifier Library Module
 *
 * This module exports the MCPVerifier class for programmatic verification
 * of MCP (Model Context Protocol) servers.
 *
 * @example
 * ```typescript
 * import { MCPVerifier } from 'agentinit/verifier';
 * import { MCPServerType } from 'agentinit/types';
 *
 * const verifier = new MCPVerifier(10000);
 * const result = await verifier.verifyServer({
 *   name: 'everything',
 *   type: MCPServerType.STDIO,
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-everything']
 * });
 * ```
 */

export { MCPVerifier, MCPVerificationError } from '../../core/mcpClient.js';
