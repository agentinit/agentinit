import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';
import { enableUppercaseToggleAllForMultiselectPrompt } from '../../src/utils/promptUtils.js';

const require = createRequire(import.meta.url);
const MultiselectPrompt = require('prompts/lib/elements/multiselect');

describe('prompt utils', () => {
  it('treats uppercase A as toggle-all for multiselect prompts', () => {
    const toggleAll = vi.fn();
    const handleSpaceToggle = vi.fn();
    const bell = vi.fn();
    const prompt = {
      _: MultiselectPrompt.prototype._,
      toggleAll,
      handleSpaceToggle,
      bell,
      maxChoices: undefined,
      cursor: 0,
      value: [{ selected: false, disabled: false }],
    };

    enableUppercaseToggleAllForMultiselectPrompt(prompt);
    prompt._('A', {});

    expect(toggleAll).toHaveBeenCalledOnce();
    expect(handleSpaceToggle).not.toHaveBeenCalled();
    expect(bell).not.toHaveBeenCalled();
  });

  it('dispatches custom hotkeys for multiselect prompts', async () => {
    const prefixHotkey = vi.fn();
    const bell = vi.fn();
    const render = vi.fn();
    const prompt = {
      _: MultiselectPrompt.prototype._,
      __agentinitHotkeys: { p: prefixHotkey },
      __agentinitHotkeyBusy: false,
      bell,
      render,
    };

    enableUppercaseToggleAllForMultiselectPrompt(prompt);
    prompt._('p', {});

    await Promise.resolve();
    await Promise.resolve();

    expect(prefixHotkey).toHaveBeenCalledOnce();
    expect(bell).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it('allows hotkeys to close the multiselect with the current selection for follow-up prompts', async () => {
    const fire = vi.fn();
    const render = vi.fn();
    const write = vi.fn();
    const close = vi.fn();

    const prompt = {
      _: MultiselectPrompt.prototype._,
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

    enableUppercaseToggleAllForMultiselectPrompt(prompt);
    prompt._('p', {});

    await Promise.resolve();
    await Promise.resolve();

    expect(fire).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith('\n');
    expect(render).toHaveBeenCalled();
  });

  it('is a no-op when called on an already-patched prompt', () => {
    const toggleAll = vi.fn();
    const prompt = {
      _: MultiselectPrompt.prototype._,
      toggleAll,
      cursor: 0,
      value: [{ selected: false, disabled: false }],
    };

    enableUppercaseToggleAllForMultiselectPrompt(prompt);
    const patchedHandler = prompt._;

    enableUppercaseToggleAllForMultiselectPrompt(prompt);

    expect(prompt._).toBe(patchedHandler);
  });

  it('is a no-op when the prompt has no _ handler', () => {
    const prompt = {
      toggleAll: vi.fn(),
      cursor: 0,
    };

    expect(() => enableUppercaseToggleAllForMultiselectPrompt(prompt)).not.toThrow();
  });
});
