import { getEffectiveTokenCountingModeSync, type TokenCountingMode } from '../core/userConfig.js';

export type TokenInput = string | object | Buffer | number | boolean;

type ContextCalcModule = {
  countTokens(input: TokenInput): number;
};

let contextCalcPromise: Promise<ContextCalcModule | null> | undefined;

function stringifyTokenInput(input: TokenInput): string {
  if (typeof input === 'string') return input;
  if (Buffer.isBuffer(input)) return input.toString('utf8');
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);

  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function estimateTokensFromText(text: string): number {
  if (text.length === 0) return 0;

  const asciiWordCount = text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
  const characterEstimate = Math.ceil(text.length / 4);

  return Math.max(1, Math.ceil((asciiWordCount + characterEstimate) / 2));
}

async function loadContextCalc(): Promise<ContextCalcModule | null> {
  contextCalcPromise ??= import('contextcalc')
    .then((module) => ({ countTokens: module.countTokens }))
    .catch(() => null);

  return contextCalcPromise;
}

/**
 * Lightweight synchronous token estimate used as the default public utility.
 * For accurate tokenization, install `contextcalc` and call `countTokensExact`.
 */
export function countTokens(input: TokenInput): number {
  return estimateTokensFromText(stringifyTokenInput(input));
}

/**
 * Uses `contextcalc` when available, loading it only on demand. Falls back to
 * the local estimator so token reporting remains available without tiktoken.
 */
export async function countTokensExact(input: TokenInput): Promise<number> {
  const contextCalc = await loadContextCalc();
  return contextCalc?.countTokens(input) ?? countTokens(input);
}

/**
 * Counts tokens using the requested mode. Accurate mode requires the optional
 * `contextcalc` package and falls back to the estimator when it is not present.
 */
export async function countTokensWithMode(
  input: TokenInput,
  mode: TokenCountingMode = getEffectiveTokenCountingModeSync(),
): Promise<number> {
  return mode === 'accurate' ? countTokensExact(input) : countTokens(input);
}
