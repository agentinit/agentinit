import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAgentCommand } from '../../src/commands/agent.js';
import { writeUserConfig } from '../../src/core/userConfig.js';
import { logger } from '../../src/utils/logger.js';

describe('agent command', () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalAgentSettingsScope = process.env.AGENTINIT_AGENT_DEFAULT_SCOPE;

  beforeEach(async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-agent-cmd-home-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'agentinit-agent-cmd-project-'));
    tempDirs.push(homeDir, projectDir);
    process.env.HOME = homeDir;
    process.chdir(projectDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalAgentSettingsScope === undefined) {
      delete process.env.AGENTINIT_AGENT_DEFAULT_SCOPE;
    } else {
      process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = originalAgentSettingsScope;
    }

    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function runAgent(args: string[]): Promise<void> {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(args, { from: 'user' });
  }

  function silenceLogger() {
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    vi.spyOn(logger, 'tree').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'success').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  }

  it('sets a Claude setting through the CLI', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'claude', 'permissions.defaultMode', 'acceptEdits', '--project']);

    await expect(readFile(join(process.cwd(), '.claude', 'settings.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      permissions: {
        defaultMode: 'acceptEdits',
      },
    });
  });

  it('defaults omitted scope flags to global for settings and hooks', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'claude', 'env', '{"AGENTINIT_TEST":"1"}', '--value-json']);
    await runAgent(['agent', 'hook', 'add', 'claude', 'after-tool-use', '--command', 'npm run lint']);

    await expect(readFile(join(process.env.HOME!, '.claude', 'settings.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      env: {
        AGENTINIT_TEST: '1',
      },
      hooks: {
        PostToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'npm run lint',
              },
            ],
          },
        ],
      },
    });
  });

  it('uses configured or environment default scope when no scope flag is provided', async () => {
    silenceLogger();

    await writeUserConfig({
      defaultAgentSettingsScope: 'project',
      customMarketplaces: [],
      verifiedGithubRepos: [],
    });

    await runAgent(['agent', 'set', 'claude', 'model', 'sonnet']);
    await expect(readFile(join(process.cwd(), '.claude', 'settings.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      model: 'sonnet',
    });

    process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = 'local';
    await runAgent(['agent', 'set', 'claude', 'effortLevel', 'high']);
    await expect(readFile(join(process.cwd(), '.claude', 'settings.local.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      effortLevel: 'high',
    });
  });

  it('parses setting values with --value-json and prints machine-readable set output with --json', async () => {
    silenceLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent(['agent', 'set', 'claude', 'env', '{"AGENTINIT_TEST":"1"}', '--project', '--value-json', '--json']);

    const result = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(result).toMatchObject({
      agent: 'claude',
      key: 'env',
      scope: 'project',
      value: {
        AGENTINIT_TEST: '1',
      },
      dryRun: false,
    });
    await expect(readFile(join(process.cwd(), '.claude', 'settings.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      env: {
        AGENTINIT_TEST: '1',
      },
    });
  });

  it('prints valid JSON for get --json including missing values', async () => {
    silenceLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent(['agent', 'set', 'claude', 'model', 'sonnet', '--global']);
    await runAgent(['agent', 'get', 'claude', 'model', '--global', '--json']);
    await runAgent(['agent', 'get', 'claude', 'effortLevel', '--global', '--json']);

    expect(JSON.parse(logSpy.mock.calls[0]![0])).toBe('sonnet');
    expect(JSON.parse(logSpy.mock.calls[1]![0])).toBeNull();
  });

  it('prints valid JSON for full-file reads with get --json', async () => {
    silenceLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent(['agent', 'set', 'claude', 'env', '{"AGENTINIT_TEST":"1"}', '--project', '--value-json']);
    await runAgent(['agent', 'get', 'claude', '--project', '--json']);

    expect(JSON.parse(logSpy.mock.calls[0]![0])).toEqual({
      env: {
        AGENTINIT_TEST: '1',
      },
    });
  });

  it('prints schema json', async () => {
    silenceLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent(['agent', 'schema', 'claude', '--json']);

    const schema = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(schema.agent).toBe('claude');
    expect(schema.effectiveDefaultScope).toBe('global');
    expect(schema.settings.some((setting: { key: string }) => setting.key === 'effortLevel')).toBe(true);
  });

  it('sets exit code for invalid keys', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'claude', 'allowedMcpServers', 'github']);

    expect(process.exitCode).toBe(1);
  });

  it('keeps raw security-sensitive settings out of the public command surface', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'claude', 'hooks', '{"PreToolUse":[]}', '--value-json']);
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;

    await runAgent(['agent', 'set', 'claude', 'permissions.defaultMode', 'bypassPermissions']);
    expect(process.exitCode).toBe(1);
  });

  it('sets an OpenCode setting through the CLI', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'model', 'anthropic/claude-sonnet-4-5', '--project']);

    await expect(readFile(join(process.cwd(), '.opencode', 'opencode.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      model: 'anthropic/claude-sonnet-4-5',
    });
  });

  it('maps permission.* to permission.default for OpenCode', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'permission.*', 'deny', '--project']);

    await expect(readFile(join(process.cwd(), '.opencode', 'opencode.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      permission: {
        default: 'deny',
      },
    });
  });

  it('rejects invalid enum values for OpenCode permissions', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'permission.bash', 'fuck_yeah', '--project']);
    expect(process.exitCode).toBe(1);
  });

  it('rejects invalid enum values for OpenCode autoupdate', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'autoupdate', 'maybe_later']);
    expect(process.exitCode).toBe(1);
  });

  it('rejects project scope for OpenCode autoupdate', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'autoupdate', 'notify', '--project']);
    expect(process.exitCode).toBe(1);
  });

  it('prints schema json for opencode', async () => {
    silenceLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent(['agent', 'schema', 'opencode', '--json']);

    const schema = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(schema.agent).toBe('opencode');
    expect(schema.effectiveDefaultScope).toBe('global');
    expect(schema.settings.some((setting: { key: string }) => setting.key === 'model')).toBe(true);

    // small_model should not exist
    expect(schema.settings.some((setting: { key: string }) => setting.key === 'small_model')).toBe(false);

    // permission.* should have nativePath: 'permission.default'
    const defaultPerm = schema.settings.find((setting: { key: string }) => setting.key === 'permission.*');
    expect(defaultPerm?.nativePath).toBe('permission.default');
    expect(defaultPerm?.valueType).toBe('enum');
    expect(defaultPerm?.allowedValues).toEqual(['allow', 'ask', 'deny']);

    // permission.bash should be enum
    const bashPerm = schema.settings.find((setting: { key: string }) => setting.key === 'permission.bash');
    expect(bashPerm?.valueType).toBe('enum');

    // autoupdate should be enum too
    const autoupdate = schema.settings.find((setting: { key: string }) => setting.key === 'autoupdate');
    expect(autoupdate?.valueType).toBe('enum');
    expect(autoupdate?.allowedValues).toEqual(['true', 'false', 'notify']);
  });

  it('adds and removes Claude hooks through typed hook commands', async () => {
    silenceLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent([
      'agent',
      'hook',
      'add',
      'claude',
      'after-tool-use',
      '--command',
      'npm run lint',
      '--matcher',
      'Edit|Write',
      '--name',
      'lint-after-edit',
      '--project',
      '--json',
    ]);

    const addResult = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(addResult).toMatchObject({
      agent: 'claude',
      event: 'PostToolUse',
      scope: 'project',
      hook: {
        type: 'command',
        command: 'npm run lint',
        name: 'lint-after-edit',
      },
    });
    await expect(readFile(join(process.cwd(), '.claude', 'settings.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit|Write',
            hooks: [
              {
                type: 'command',
                command: 'npm run lint',
                name: 'lint-after-edit',
              },
            ],
          },
        ],
      },
    });

    await runAgent(['agent', 'hook', 'remove', 'claude', 'post-tool-use', 'lint-after-edit', '--matcher', 'Edit|Write', '--project', '--json']);

    const removeResult = JSON.parse(logSpy.mock.calls[1]![0]);
    expect(removeResult.removed).toBe(1);
    await expect(readFile(join(process.cwd(), '.claude', 'settings.json'), 'utf8').then(JSON.parse)).resolves.toEqual({});
  });
});
