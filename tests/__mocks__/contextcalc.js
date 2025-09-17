// Mock for contextcalc module
import { jest } from '@jest/globals';

export const countTokens = jest.fn((input) => {
  // Simple mock that returns a reasonable token count based on input length
  if (typeof input === 'string') {
    return Math.ceil(input.length / 4); // Rough approximation of tokens
  }
  if (typeof input === 'object') {
    return Math.ceil(JSON.stringify(input).length / 4);
  }
  return 0;
});

export const countTokensWithOptions = jest.fn((input, options) => ({
  tokens: countTokens(input),
  lines: typeof input === 'string' ? input.split('\n').length : 1,
  formatted: `${countTokens(input)} tokens`
}));

export const countTokensBatch = jest.fn((inputs) => 
  inputs.map(input => countTokens(input))
);

export const countTokensFromFile = jest.fn(async (filePath) => 100);

export const countTokensFromFileWithOptions = jest.fn(async (filePath, options) => ({
  tokens: 100,
  lines: 10,
  formatted: '100 tokens'
}));

export const dispose = jest.fn();

export const getTokenizerInfo = jest.fn(() => ({
  encoding: 'cl100k_base'
}));

export const version = '1.3.2';
export const count = countTokens;
export const countJson = countTokens;

export const countWithLines = jest.fn((input) => ({
  tokens: countTokens(input),
  lines: typeof input === 'string' ? input.split('\n').length : 1
}));

export const countFormatted = jest.fn((input) => ({
  tokens: countTokens(input),
  formatted: `${countTokens(input)} tokens`
}));

export const estimateTokens = jest.fn((input) => countTokens(input));