/**
 * MCP Types Library Module
 *
 * This module exports all type definitions needed for working with
 * the MCP verifier library.
 *
 * @example
 * ```typescript
 * import type { MCPServerConfig, MCPVerificationResult } from 'agentinit/types';
 * import { MCPServerType } from 'agentinit/types';
 *
 * const config: MCPServerConfig = {
 *   name: 'my-server',
 *   type: MCPServerType.STDIO,
 *   command: 'node',
 *   args: ['server.js']
 * };
 * ```
 */

// Re-export MCP-related types and enums
export type {
  MCPServerConfig,
  MCPVerificationResult,
  MCPCapabilities,
  MCPTool,
  MCPResource,
  MCPPrompt
} from '../../types/index.js';

export { MCPServerType } from '../../types/index.js';

// Re-export constants
export { DEFAULT_CONNECTION_TIMEOUT_MS } from '../../constants/index.js';
