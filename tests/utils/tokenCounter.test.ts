import { afterEach, describe, expect, it, vi } from 'vitest';
import { countTokens, countTokensWithMode } from '../../src/utils/tokenCounter.js';

describe('tokenCounter', () => {
  const originalTokenCountingMode = process.env.AGENTINIT_TOKEN_COUNTING_MODE;

  afterEach(() => {
    vi.doUnmock('contextcalc');
    vi.resetModules();
    if (originalTokenCountingMode === undefined) {
      delete process.env.AGENTINIT_TOKEN_COUNTING_MODE;
    } else {
      process.env.AGENTINIT_TOKEN_COUNTING_MODE = originalTokenCountingMode;
    }
  });

  it('estimates tokens synchronously without external dependencies', () => {
    expect(countTokens('Hello world')).toBeGreaterThan(0);
    expect(countTokens({ command: 'npx', args: ['server'] })).toBeGreaterThan(0);
  });

  it('uses estimates when estimate mode is requested', async () => {
    await expect(countTokensWithMode('Hello world', 'estimate')).resolves.toBe(countTokens('Hello world'));
  });

  it('falls back to the estimator when accurate tokenization is unavailable', async () => {
    const { countTokensExact } = await import('../../src/utils/tokenCounter.js');
    await expect(countTokensExact('Hello world')).resolves.toBeGreaterThan(0);
  });

  it('delegates accurate tokenization to contextcalc when available', async () => {
    const countTokensMock = vi.fn().mockReturnValue(123);
    vi.doMock('contextcalc', () => ({ countTokens: countTokensMock }));

    const { countTokensExact, countTokensWithMode } = await import('../../src/utils/tokenCounter.js');

    await expect(countTokensExact('Hello world')).resolves.toBe(123);
    await expect(countTokensWithMode('Hello world', 'accurate')).resolves.toBe(123);
    expect(countTokensMock).toHaveBeenCalledWith('Hello world');
  });

  it('uses the configured accurate mode when no explicit mode is passed', async () => {
    const countTokensMock = vi.fn().mockReturnValue(321);
    process.env.AGENTINIT_TOKEN_COUNTING_MODE = 'accurate';
    vi.doMock('contextcalc', () => ({ countTokens: countTokensMock }));

    const { countTokensWithMode } = await import('../../src/utils/tokenCounter.js');

    await expect(countTokensWithMode('Hello world')).resolves.toBe(321);
  });
});
