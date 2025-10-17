export const TOKEN_COUNT_THRESHOLDS = {
  LOW: 5000,
  MEDIUM: 15000
} as const;

export type TokenCountThreshold = typeof TOKEN_COUNT_THRESHOLDS[keyof typeof TOKEN_COUNT_THRESHOLDS];

/**
 * Multiplier applied to base token counts for MCP tool definitions.
 *
 * This accounts for Claude Code's system overhead when presenting tools to the model:
 * - System instructions for MCP tool usage patterns
 * - Additional formatting and metadata per tool
 * - Function calling protocol overhead
 *
 * Validated against @modelcontextprotocol/server-everything v0.6.2 on Claude Code v2.x
 * Example: echo tool shows ~340 base tokens, 596 actual tokens in /context (1.75x ratio)
 * Applied multiplier: 5x (previous empirical baseline) * 1.75 = 8.75 ≈ 9
 */
export const MCP_TOOL_TOKEN_MULTIPLIER = 9;