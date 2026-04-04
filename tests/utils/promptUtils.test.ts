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
});
