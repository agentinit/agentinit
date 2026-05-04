import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncCommand } from '../../src/commands/sync.js';
import { AgentsMdManager } from '../../src/core/agentsMdManager.js';
import { ManagedStateStore } from '../../src/core/managedState.js';
import { Propagator } from '../../src/core/propagator.js';
import { logger } from '../../src/utils/logger.js';

const { oraMock, spinner } = vi.hoisted(() => {
  const spinner = {
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  };

  spinner.start.mockReturnValue(spinner);

  return {
    oraMock: vi.fn(() => spinner),
    spinner,
  };
});

vi.mock('ora', () => ({
  default: oraMock,
}));

describe('sync command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    oraMock.mockClear();
    spinner.start.mockClear();
    spinner.succeed.mockClear();
    spinner.fail.mockClear();
    spinner.start.mockReturnValue(spinner);
  });

  function mockLogger(): void {
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'success').mockImplementation(() => {});
    vi.spyOn(logger, 'warning').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  }

  function mockSuccessfulSync(
    changes: Array<{
      agent: string;
      agents: string[];
      action: 'created' | 'updated' | 'backed_up';
      file: string;
    }> = [],
  ): void {
    vi.spyOn(ManagedStateStore, 'open').mockResolvedValue({
      save: vi.fn(),
    } as unknown as ManagedStateStore);
    vi.spyOn(Propagator.prototype, 'syncAgentsFile').mockResolvedValue({
      success: true,
      changes,
      warnings: [],
      errors: [],
      resolvedTargets: [],
    });
  }

  it('runs --symlink even when sync has no file changes', async () => {
    mockLogger();
    mockSuccessfulSync();
    const symlinkSpy = vi.spyOn(AgentsMdManager.prototype, 'symlinkClaude').mockResolvedValue();

    await syncCommand({ symlink: true });

    expect(symlinkSpy).toHaveBeenCalledTimes(1);
  });

  it('does not create symlinks during dry-run sync', async () => {
    mockLogger();
    mockSuccessfulSync([{ action: 'created', file: '/tmp/CLAUDE.md', agent: 'claude', agents: ['claude'] }]);
    const symlinkSpy = vi.spyOn(AgentsMdManager.prototype, 'symlinkClaude').mockResolvedValue();

    await syncCommand({ symlink: true, dryRun: true });

    expect(symlinkSpy).not.toHaveBeenCalled();
  });
});
