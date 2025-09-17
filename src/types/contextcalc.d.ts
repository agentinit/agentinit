declare module 'contextcalc' {
  export interface TokenCountOptions {
    format?: 'raw' | 'formatted';
    includeLines?: boolean;
  }

  export interface TokenCountResult {
    tokens: number;
    lines?: number;
    formatted?: string;
  }

  export type TokenInput = string | object | Buffer | number | boolean;

  /**
   * Count tokens in a string
   */
  export function countTokens(input: TokenInput): number;

  /**
   * Count tokens with additional options and metadata
   */
  export function countTokensWithOptions(input: TokenInput, options?: TokenCountOptions): TokenCountResult;

  /**
   * Count tokens for multiple inputs in batch
   */
  export function countTokensBatch(inputs: TokenInput[]): number[];

  /**
   * Count tokens from a file (async)
   */
  export function countTokensFromFile(filePath: string): Promise<number>;

  /**
   * Count tokens from a file with additional metadata (async)
   */
  export function countTokensFromFileWithOptions(filePath: string, options?: TokenCountOptions): Promise<TokenCountResult>;

  /**
   * Dispose of the tokenizer instance (cleanup)
   */
  export function dispose(): void;

  /**
   * Get information about the tokenizer being used
   */
  export function getTokenizerInfo(): {
    encoding: string;
  };

  /**
   * Version information for the library
   */
  export const version: string;

  /**
   * Count tokens in a string (alias for countTokens)
   */
  export const count: typeof countTokens;

  /**
   * Count tokens in JSON object (alias for countTokens)
   */
  export const countJson: typeof countTokens;

  /**
   * Count tokens in text with line count
   */
  export function countWithLines(input: string): {
    tokens: number;
    lines: number;
  };

  /**
   * Count tokens with formatted output
   */
  export function countFormatted(input: string): {
    tokens: number;
    formatted: string;
  };

  /**
   * Quick token estimation for large objects
   * Useful for getting a rough estimate without full tokenization
   */
  export function estimateTokens(input: string | object): number;
}