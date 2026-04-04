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
  hint?: string;
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
      __agentinitUppercaseToggleAllPatched?: boolean;
    } | undefined;

    if (!prototype || typeof prototype._ !== 'function' || prototype.__agentinitUppercaseToggleAllPatched) {
      return;
    }

    const originalHandler = prototype._;
    prototype._ = function agentinitMultiselectHandler(input: string, key: unknown): unknown {
      return originalHandler.call(this, input === 'A' ? 'a' : input, key);
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
): Promise<Record<string, T[] | undefined>> {
  enableUppercaseToggleAllForMultiselectPrompt();

  return prompts({
    ...options,
    type: 'multiselect',
    instructions: options.instructions ?? false,
    hint: options.hint ?? MULTISELECT_TOGGLE_ALL_HINT,
  }) as Promise<Record<string, T[] | undefined>>;
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
