import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as TOML from '@iarna/toml';
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

  it('sets Codex TOML settings and hooks through the CLI', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'codex', 'features.codex_hooks', 'true']);
    await runAgent(['agent', 'set', 'codex', 'web_search', 'cached']);
    await runAgent(['agent', 'hook', 'add', 'codex', 'pre-tool-use', '--command', 'npm run lint', '--matcher', '^Bash$', '--project']);

    await expect(readFile(join(process.env.HOME!, '.codex', 'config.toml'), 'utf8').then(content => TOML.parse(content))).resolves.toMatchObject({
      features: {
        codex_hooks: true,
      },
      web_search: 'cached',
    });
    await expect(readFile(join(process.cwd(), '.codex', 'config.toml'), 'utf8').then(content => TOML.parse(content))).resolves.toMatchObject({
      hooks: {
        PreToolUse: [
          {
            matcher: '^Bash$',
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

  it('sets OpenCode settings through schema-valid native paths', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'model', 'anthropic/claude-sonnet-4-5', '--project']);
    await runAgent(['agent', 'set', 'opencode', 'small_model', 'anthropic/claude-haiku-4-5', '--project']);
    await runAgent(['agent', 'set', 'opencode', 'default_agent', 'my_custom', '--project']);
    await runAgent(['agent', 'set', 'opencode', 'permission.*', 'ask', '--project']);
    await runAgent(['agent', 'set', 'opencode', 'permission.bash', 'allow', '--project']);

    await expect(readFile(join(process.cwd(), '.opencode', 'opencode.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      model: 'anthropic/claude-sonnet-4-5',
      small_model: 'anthropic/claude-haiku-4-5',
      default_agent: 'my_custom',
      permission: {
        '*': 'ask',
        bash: 'allow',
      },
    });
  });

  it('sets OpenCode providers through a JSON provider map', async () => {
    silenceLogger();

    await runAgent([
      'agent',
      'set',
      'opencode',
      'provider',
      JSON.stringify({
        'local-llm': {
          name: 'Local LLM',
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://localhost:11434/v1',
          },
          models: {
            'llama-3': {
              name: 'Llama 3',
              tool_call: true,
            },
          },
        },
      }),
      '--project',
      '--value-json',
    ]);

    await expect(readFile(join(process.cwd(), '.opencode', 'opencode.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      provider: {
        'local-llm': {
          name: 'Local LLM',
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://localhost:11434/v1',
          },
          models: {
            'llama-3': {
              name: 'Llama 3',
              tool_call: true,
            },
          },
        },
      },
    });
  });

  it('writes OpenCode autoupdate booleans and notify with native value types', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'autoupdate', 'false']);
    await expect(readFile(join(process.env.HOME!, '.config', 'opencode', 'opencode.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      autoupdate: false,
    });

    await runAgent(['agent', 'set', 'opencode', 'autoupdate', 'notify']);
    await expect(readFile(join(process.env.HOME!, '.config', 'opencode', 'opencode.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      autoupdate: 'notify',
    });
  });

  it('updates existing OpenCode project JSONC config instead of shadowing it with JSON', async () => {
    silenceLogger();
    const jsoncPath = join(process.cwd(), '.opencode', 'opencode.jsonc');
    const jsonPath = join(process.cwd(), '.opencode', 'opencode.json');
    await mkdir(join(process.cwd(), '.opencode'), { recursive: true });
    await writeFile(jsoncPath, '{\n  // existing OpenCode JSONC\n  "snapshot": true,\n}\n');

    await runAgent(['agent', 'set', 'opencode', 'model', 'anthropic/claude-sonnet-4-5', '--project']);

    await expect(access(jsonPath)).rejects.toThrow();
    await expect(readFile(jsoncPath, 'utf8').then(JSON.parse)).resolves.toEqual({
      snapshot: true,
      model: 'anthropic/claude-sonnet-4-5',
    });
  });

  it('updates existing OpenCode global JSONC config', async () => {
    silenceLogger();
    const configDir = join(process.env.HOME!, '.config', 'opencode');
    const jsoncPath = join(configDir, 'opencode.jsonc');
    const jsonPath = join(configDir, 'opencode.json');
    await mkdir(configDir, { recursive: true });
    await writeFile(jsoncPath, '{\n  // existing OpenCode JSONC\n  "autoupdate": "notify",\n}\n');

    await runAgent(['agent', 'set', 'opencode', 'shell', 'zsh']);

    await expect(access(jsonPath)).rejects.toThrow();
    await expect(readFile(jsoncPath, 'utf8').then(JSON.parse)).resolves.toEqual({
      autoupdate: 'notify',
      shell: 'zsh',
    });
  });

  it('rejects unsupported OpenCode local scope', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'model', 'anthropic/claude-sonnet-4-5', '--local']);

    expect(process.exitCode).toBe(1);
  });

  it('rejects invalid OpenCode positive integer settings', async () => {
    silenceLogger();

    await runAgent(['agent', 'set', 'opencode', 'tool_output.max_lines', '0', '--project']);

    expect(process.exitCode).toBe(1);
  });

  it('prints schema json for OpenCode', async () => {
    silenceLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAgent(['agent', 'schema', 'opencode', '--json']);

    const schema = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(schema.agent).toBe('opencode');
    expect(schema.effectiveDefaultScope).toBe('global');
    expect(schema.settings).toContainEqual(expect.objectContaining({
      key: 'permission.*',
      nativePath: 'permission.*',
      valueType: 'enum',
      allowedValues: ['allow', 'ask', 'deny'],
      scopes: ['global', 'project'],
    }));
    expect(schema.settings).toContainEqual(expect.objectContaining({
      key: 'autoupdate',
      valueType: 'booleanOrEnum',
      allowedValues: ['notify'],
      scopes: ['global'],
    }));
    expect(schema.settings).toContainEqual(expect.objectContaining({
      key: 'provider',
      valueType: 'object',
      risk: 'security-sensitive',
      scopes: ['global', 'project'],
    }));
    expect(schema.settings).toContainEqual(expect.objectContaining({
      key: 'tool_output.max_lines',
      valueType: 'positiveInteger',
      scopes: ['global', 'project'],
    }));
    expect(schema.settings).toContainEqual(expect.objectContaining({
      key: 'default_agent',
      valueType: 'string',
    }));
    expect(schema.settings).toContainEqual(expect.objectContaining({
      key: 'small_model',
      valueType: 'string',
    }));
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
