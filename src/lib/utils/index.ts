/**
 * Utility Functions Library Module
 *
 * This module exports utility functions for working with MCP servers
 * and token counting.
 *
 * @example
 * ```typescript
 * import { countTokens, MCPParser } from 'agentinit/utils';
 *
 * const tokens = countTokens('Hello world');
 * const parsed = MCPParser.parseArguments(['--mcp-stdio', 'server', 'npx', 'mcp-server']);
 * ```
 */

// Re-export token counting utility
export { countTokens } from 'contextcalc';

// Re-export MCP parser
export { MCPParser, MCPParseError } from '../../core/mcpParser.js';

// Re-export logger for library users who want consistent logging
export { Logger, logger } from '../../utils/logger.js';
