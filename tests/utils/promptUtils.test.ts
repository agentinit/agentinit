import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';
import { enableUppercaseToggleAllForMultiselectPrompt } from '../../src/utils/promptUtils.js';

const require = createRequire(import.meta.url);
const MultiselectPrompt = require('prompts/lib/elements/multiselect');

describe('prompt utils', () => {
  it('treats uppercase A as toggle-all for multiselect prompts', () => {
    enableUppercaseToggleAllForMultiselectPrompt();

    const toggleAll = vi.fn();
    const handleSpaceToggle = vi.fn();
    const bell = vi.fn();

    MultiselectPrompt.prototype._.call(
      {
        toggleAll,
        handleSpaceToggle,
        bell,
        maxChoices: undefined,
        cursor: 0,
        value: [{ selected: false, disabled: false }],
      },
      'A',
      {},
    );

    expect(toggleAll).toHaveBeenCalledOnce();
    expect(handleSpaceToggle).not.toHaveBeenCalled();
    expect(bell).not.toHaveBeenCalled();
  });

  it('dispatches custom hotkeys for multiselect prompts', async () => {
    enableUppercaseToggleAllForMultiselectPrompt();

    const prefixHotkey = vi.fn();
    const bell = vi.fn();
    const render = vi.fn();

    MultiselectPrompt.prototype._.call(
      {
        __agentinitHotkeys: { p: prefixHotkey },
        __agentinitHotkeyBusy: false,
        bell,
        render,
      },
      'p',
      {},
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(prefixHotkey).toHaveBeenCalledOnce();
    expect(bell).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it('allows hotkeys to close the multiselect with the current selection for follow-up prompts', async () => {
    enableUppercaseToggleAllForMultiselectPrompt();

    const fire = vi.fn();
    const render = vi.fn();
    const write = vi.fn();
    const close = vi.fn();

    const prompt = {
      __agentinitHotkeys: {
        p: vi.fn(currentPrompt => {
          const typedPrompt = currentPrompt as {
            done?: boolean;
            aborted?: boolean;
            fire?: () => void;
            render?: () => void;
            out?: { write: (value: string) => void };
            close?: () => void;
          };

          typedPrompt.done = true;
          typedPrompt.aborted = false;
          typedPrompt.fire?.();
          typedPrompt.render?.();
          typedPrompt.out?.write('\n');
          typedPrompt.close?.();
        }),
      },
      __agentinitHotkeyBusy: false,
      fire,
      render,
      close,
      out: { write },
    };

    MultiselectPrompt.prototype._.call(prompt, 'p', {});

    await Promise.resolve();
    await Promise.resolve();

    expect(fire).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith('\n');
    expect(render).toHaveBeenCalled();
  });
});
