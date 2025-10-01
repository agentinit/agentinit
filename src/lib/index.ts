/**
 * AgentInit Library
 *
 * Programmatic API for MCP (Model Context Protocol) server verification.
 *
 * This library allows you to verify MCP servers, calculate token usage,
 * and work with MCP configurations programmatically.
 *
 * @example Basic Usage
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
 *
 * if (result.status === 'success') {
 *   console.log(`Tools: ${result.capabilities?.tools.length}`);
 * }
 * ```
 *
 * @example Submodule Imports
 * ```typescript
 * // Import from specific submodules for tree-shaking
 * import { MCPVerifier } from 'agentinit/verifier';
 * import { MCPServerType } from 'agentinit/types';
 * import { countTokens } from 'agentinit/utils';
 * ```
 *
 * @module agentinit
 */

// Re-export everything from submodules
export * from './verifier/index.js';
export * from './types/index.js';
export * from './utils/index.js';
