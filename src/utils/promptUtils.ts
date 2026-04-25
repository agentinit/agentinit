import prompts from 'prompts';
import { createRequire } from 'module';
import { dim } from './colors.js';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);

const MULTISELECT_TOGGLE_ALL_HINT = 'Press Space to select, A to select or deselect all, then Enter to confirm.';

let uppercaseToggleAllPatched = false;

type MultiselectChoice<T> = {
  title: string;
  value: T;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
};

type PromptMultiselectOptions<T> = {
  name: string;
  message: string;
  min?: number;
  choices: MultiselectChoice<T>[];
  instructions?: boolean;
  hint?: string | (() => string);
  cursor?: number;
  onRenderPrompt?: (prompt: unknown) => void;
  hotkeys?: Record<string, (controls: PromptHotkeyControls, input: string, key: unknown) => void | Promise<void>>;
};

type PromptMultiselectResult<T> = Record<string, T[] | undefined> & {
  __agentinitAction?: string;
};

type PromptHotkeyControls = {
  prompt: unknown;
  requestAction: (action: string) => void;
  closeWithCurrentSelection: () => boolean;
};

type PromptRuntime = {
  aborted?: boolean;
  close?: () => void;
  done?: boolean;
  fire?: () => void;
  out?: { write: (value: string) => void };
  render?: () => void;
};

type BundlePluginEntry = {
  name: string;
  description?: string;
};

export function enableUppercaseToggleAllForMultiselectPrompt(): void {
  if (uppercaseToggleAllPatched) {
    return;
  }

  uppercaseToggleAllPatched = true;

  try {
    const MultiselectPrompt = require('prompts/lib/elements/multiselect');
    const prototype = MultiselectPrompt?.prototype as {
      _?: (input: string, key: unknown) => unknown;
      hint?: string;
      render?: () => void;
      __agentinitHotkeys?: Record<string, (prompt: unknown, input: string, key: unknown) => void | Promise<void>>;
      __agentinitHotkeyBusy?: boolean;
      __agentinitUppercaseToggleAllPatched?: boolean;
    } | undefined;

    if (!prototype || typeof prototype._ !== 'function' || prototype.__agentinitUppercaseToggleAllPatched) {
      return;
    }

    const originalHandler = prototype._;
    prototype._ = function agentinitMultiselectHandler(input: string, key: unknown): unknown {
      if (this.__agentinitHotkeyBusy) {
        return;
      }

      const normalizedInput = input === 'A' ? 'a' : input;
      const hotkeyHandler = this.__agentinitHotkeys?.[normalizedInput] || this.__agentinitHotkeys?.[input];

      if (hotkeyHandler) {
        this.__agentinitHotkeyBusy = true;
        void Promise.resolve(hotkeyHandler(this, normalizedInput, key)).finally(() => {
          this.__agentinitHotkeyBusy = false;
          if (typeof this.render === 'function') {
            this.render();
          }
        });
        return;
      }

      return originalHandler.call(this, normalizedInput, key);
    };

    Object.defineProperty(prototype, '__agentinitUppercaseToggleAllPatched', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  } catch {
    // prompts may be mocked in tests or bundled differently; fall back silently.
  }
}

export async function promptMultiselect<T>(
  options: PromptMultiselectOptions<T>,
): Promise<PromptMultiselectResult<T>> {
  enableUppercaseToggleAllForMultiselectPrompt();

  const userOnRender = options.onRenderPrompt;
  const hint = options.hint;
  let requestedAction: string | undefined;
  let promptInstance: {
    __agentinitHotkeys?: Record<string, (prompt: unknown, input: string, key: unknown) => void | Promise<void>>;
    hint: string;
  } | undefined;
  const closeWithCurrentSelection = (prompt: PromptRuntime): boolean => {
    if (typeof prompt.close !== 'function') {
      return false;
    }

    prompt.done = true;
    prompt.aborted = false;
    prompt.fire?.();
    prompt.render?.();
    prompt.out?.write('\n');
    prompt.close();
    return true;
  };
  const hotkeys = options.hotkeys
    ? Object.fromEntries(
        Object.entries(options.hotkeys).map(([key, handler]) => [
          key,
          (prompt: unknown, input: string, pressedKey: unknown) => handler(
            {
              prompt,
              requestAction: action => {
                requestedAction = action;
              },
              closeWithCurrentSelection: () => closeWithCurrentSelection(prompt as PromptRuntime),
            },
            input,
            pressedKey,
          ),
        ]),
      )
    : undefined;

  const response = await prompts({
    ...options,
    type: 'multiselect',
    instructions: options.instructions ?? false,
    hint: typeof hint === 'function' ? hint() : hint ?? MULTISELECT_TOGGLE_ALL_HINT,
    onRender(this: {
      __agentinitHotkeys?: Record<string, (prompt: unknown, input: string, key: unknown) => void | Promise<void>>;
      hint: string;
    }) {
      promptInstance = this;
      if (hotkeys) {
        this.__agentinitHotkeys = hotkeys;
      } else {
        delete this.__agentinitHotkeys;
      }
      this.hint = typeof hint === 'function' ? hint() : hint ?? MULTISELECT_TOGGLE_ALL_HINT;
      userOnRender?.(this);
    },
  }) as PromptMultiselectResult<T>;

  if (requestedAction) {
    response.__agentinitAction = requestedAction;
  }

  return response;
}

export async function selectBundlePlugins(
  entries: BundlePluginEntry[],
  actionLabel: string,
  options: { selectAll?: boolean } = {},
): Promise<string[] | null> {
  if (options.selectAll) {
    logger.info('Selecting all bundled plugins (--all).');
    return entries.map(entry => entry.name);
  }

  logger.info(dim(MULTISELECT_TOGGLE_ALL_HINT));
  const response = await promptMultiselect<string>({
    name: 'plugins',
    message: `This repository contains multiple plugins. Select which to ${actionLabel}:`,
    min: 1,
    choices: entries.map(entry => ({
      title: entry.name,
      value: entry.name,
      ...(entry.description ? { description: entry.description } : {}),
    })),
  });

  if (!response.plugins || response.plugins.length === 0) {
    logger.info('Cancelled.');
    return null;
  }

  return response.plugins;
}
