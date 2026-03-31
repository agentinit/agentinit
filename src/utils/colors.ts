/**
 * Extended color utilities.
 * Re-exports kleur/colors and adds orange (not natively supported by kleur).
 */
export { cyan, green, yellow, red, bold, dim, white } from 'kleur/colors';

/**
 * Match kleur's runtime color enablement so custom ANSI colors respect
 * NO_COLOR/NODE_DISABLE_COLORS/TERM/FORCE_COLOR and non-TTY output.
 */
function colorsEnabled(): boolean {
  const env = process.env || {};
  const isTTY = !!process.stdout?.isTTY;

  return !env.NODE_DISABLE_COLORS
    && env.NO_COLOR == null
    && env.TERM !== 'dumb'
    && ((env.FORCE_COLOR != null && env.FORCE_COLOR !== '0') || isTTY);
}

/**
 * Orange text using ANSI 256-color escape code (color 208).
 */
export function orange(text: string): string {
  if (!colorsEnabled()) {
    return text;
  }

  return `\x1b[38;5;208m${text}\x1b[39m`;
}
