import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/utils/logger.js';

const ansiPattern = /\x1b\[[0-9;]*m/g;

describe('logger', () => {
  const originalColumns = process.stdout.columns;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: originalColumns,
    });
  });

  it('keeps boxed titles within the terminal width', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 20,
    });

    logger.titleBox('AgentInit  Plugin Search');

    const lines = logSpy.mock.calls.map(call => String(call[0]).replace(ansiPattern, ''));
    expect(lines).toHaveLength(3);
    expect(lines.every(line => line.length <= 20)).toBe(true);
    expect(lines[1]).toContain('...');
  });
});
