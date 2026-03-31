import { afterEach, describe, expect, it } from 'vitest';
import { orange } from '../../src/utils/colors.js';

describe('colors', () => {
  const originalEnv = { ...process.env };
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: originalIsTTY,
    });
  });

  it('disables custom orange when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });

    expect(orange('Claude Code')).toBe('Claude Code');
  });

  it('keeps custom orange enabled when colors are forced', () => {
    delete process.env.NO_COLOR;
    delete process.env.NODE_DISABLE_COLORS;
    process.env.FORCE_COLOR = '1';
    process.env.TERM = 'xterm-256color';
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: false,
    });

    expect(orange('Claude Code')).toContain('\x1b[38;5;208m');
  });
});
