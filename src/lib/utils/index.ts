/**
 * Utility Functions Library Module
 *
 * This module exports utility functions for working with MCP servers
 * and token counting.
 *
 * @example
 * ```typescript
 * import { countTokens, MCPParser, fetchLatestVersion } from 'agentinit/utils';
 *
 * const tokens = countTokens('Hello world');
 * const parsed = MCPParser.parseArguments(['--mcp-stdio', 'server', 'npx', 'mcp-server']);
 * const version = await fetchLatestVersion('chrome-devtools-mcp');
 * ```
 */

// Re-export token counting utility
export { countTokens } from 'contextcalc';

// Re-export MCP parser
export { MCPParser, MCPParseError } from '../../core/mcpParser.js';

// Re-export logger for library users who want consistent logging
export { Logger, logger } from '../../utils/logger.js';

// Re-export package version utilities
export {
  extractExplicitVersion,
  extractPackageName,
  extractPackageFromCommand,
  fetchLatestVersion,
  clearVersionCache,
  getVersionCacheStats
} from '../../utils/packageVersion.js';
