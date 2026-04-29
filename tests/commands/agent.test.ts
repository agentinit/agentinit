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
  const originalApiKey = process.env.AGENTINIT_TEST_API_KEY;

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

    if (originalApiKey === undefined) {
      delete process.env.AGENTINIT_TEST_API_KEY;
    } else {
      process.env.AGENTINIT_TEST_API_KEY = originalApiKey;
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

  it('sets global Claude config settings through the CLI', async () => {
    silenceLogger();

    await writeUserConfig({
      defaultAgentSettingsScope: 'project',
      customMarketplaces: [],
      verifiedGithubRepos: [],
    });
    await runAgent(['agent', 'set', 'claude', 'theme', 'dark']);
    await runAgent(['agent', 'set', 'claude', 'taskCompleteNotifEnabled', 'true']);

    await expect(readFile(join(process.env.HOME!, '.claude.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      theme: 'dark',
      taskCompleteNotifEnabled: true,
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

  it('includes registered global Claude config values in global full reads without exposing internal state', async () => {
    silenceLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent(['agent', 'set', 'claude', 'model', 'sonnet', '--global']);
    await runAgent(['agent', 'set', 'claude', 'theme', 'dark']);
    await runAgent(['agent', 'get', 'claude', '--global', '--json']);

    expect(JSON.parse(logSpy.mock.calls[0]![0])).toEqual({
      model: 'sonnet',
      theme: 'dark',
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
    expect(schema.settings).toContainEqual(expect.objectContaining({
      key: 'theme',
      store: 'globalConfig',
      scopes: ['global'],
    }));
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

  it('manages Claude custom API key trust without printing the raw key', async () => {
    const rawKey = 'sk-ant-12345678901234567890';
    process.env.AGENTINIT_TEST_API_KEY = rawKey;
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    vi.spyOn(logger, 'tree').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const successSpy = vi.spyOn(logger, 'success').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent(['agent', 'api-key', 'approve', 'claude', '--env', 'AGENTINIT_TEST_API_KEY', '--json']);
    await runAgent(['agent', 'api-key', 'status', 'claude', '--env', 'AGENTINIT_TEST_API_KEY', '--json']);
    await runAgent(['agent', 'api-key', 'status', 'claude', '--env', 'AGENTINIT_TEST_API_KEY']);

    const approveResult = JSON.parse(logSpy.mock.calls[0]![0]);
    const statusResult = JSON.parse(logSpy.mock.calls[1]![0]);
    expect(approveResult).toMatchObject({
      fingerprint: '12345678901234567890',
      status: 'approved',
    });
    expect(statusResult.status).toBe('approved');
    const output = [
      ...logSpy.mock.calls.map(call => call[0]),
      ...infoSpy.mock.calls.flat().map(String),
      ...successSpy.mock.calls.flat().map(String),
    ].join('\n');
    expect(output).not.toContain(rawKey);
    await expect(readFile(join(process.env.HOME!, '.claude.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      customApiKeyResponses: {
        approved: ['12345678901234567890'],
        rejected: [],
      },
    });
  });

  it('supports explicit API keys with a human-readable warning', async () => {
    const rawKey = 'sk-ant-12345678901234567890';
    vi.spyOn(logger, 'titleBox').mockImplementation(() => {});
    vi.spyOn(logger, 'tree').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'success').mockImplementation(() => {});
    const warningSpy = vi.spyOn(logger, 'warning').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await runAgent(['agent', 'api-key', 'approve', 'claude', '--key', rawKey]);

    expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('shell history'));
    await expect(readFile(join(process.env.HOME!, '.claude.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      customApiKeyResponses: {
        approved: ['12345678901234567890'],
        rejected: [],
      },
    });
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
