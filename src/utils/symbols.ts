/**
 * Centralized Unicode symbol registry for CLI output.
 * Replaces emoji usage for consistent cross-terminal rendering.
 */

/** Status indicator symbols */
export const STATUS = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  debug: '•',
} as const;

/** Tree connector characters for nested output */
export const TREE = {
  branch: '├─',
  last: '└─',
} as const;

/** Box-drawing characters */
export const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
} as const;
