import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentSettingsManager } from '../../../src/core/agentSettings/settingsManager.js';
import { writeUserConfig } from '../../../src/core/userConfig.js';

describe('AgentSettingsManager', () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;
  const originalAgentSettingsScope = process.env.AGENTINIT_AGENT_DEFAULT_SCOPE;
  let projectPath: string;

  beforeEach(async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'agentinit-agent-home-'));
    projectPath = await mkdtemp(join(tmpdir(), 'agentinit-agent-project-'));
    tempDirs.push(homeDir, projectPath);
    process.env.HOME = homeDir;
  });

  afterEach(async () => {
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

  async function readProjectSettings() {
    return JSON.parse(await readFile(join(projectPath, '.claude', 'settings.json'), 'utf8'));
  }

  async function readGlobalSettings() {
    return JSON.parse(await readFile(join(process.env.HOME!, '.claude', 'settings.json'), 'utf8'));
  }

  it('sets nested Claude settings in global scope by default', async () => {
    const manager = new AgentSettingsManager();

    await manager.set('claude', 'permissions.defaultMode', 'acceptEdits', { projectPath });

    await expect(readGlobalSettings()).resolves.toEqual({
      permissions: {
        defaultMode: 'acceptEdits',
      },
    });
  });

  it('parses booleans, enums, arrays, and objects', async () => {
    const manager = new AgentSettingsManager();

    await manager.set('claude', 'alwaysThinkingEnabled', 'on', { projectPath });
    await manager.set('claude', 'effortLevel', 'high', { projectPath });
    await manager.set('claude', 'permissions.allow', 'Bash(npm run test *)', { projectPath });
    await manager.set('claude', 'env', '{"AGENTINIT_TEST":"1"}', {
      projectPath,
      parseJson: true,
    });

    await expect(readGlobalSettings()).resolves.toMatchObject({
      alwaysThinkingEnabled: true,
      effortLevel: 'high',
      permissions: {
        allow: ['Bash(npm run test *)'],
      },
      env: {
        AGENTINIT_TEST: '1',
      },
    });
  });

  it('respects configured and environment default scopes when no explicit scope is provided', async () => {
    const manager = new AgentSettingsManager();

    await writeUserConfig({
      defaultAgentSettingsScope: 'project',
      customMarketplaces: [],
      verifiedGithubRepos: [],
    });
    await manager.set('claude', 'model', 'sonnet', { projectPath });
    await expect(readProjectSettings()).resolves.toEqual({
      model: 'sonnet',
    });

    process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = 'local';
    await manager.set('claude', 'effortLevel', 'high', { projectPath });
    await expect(readFile(join(projectPath, '.claude', 'settings.local.json'), 'utf8').then(JSON.parse)).resolves.toEqual({
      effortLevel: 'high',
    });
  });

  it('exposes the effective default scope in the schema', async () => {
    const manager = new AgentSettingsManager();

    expect(manager.getSchema('claude').effectiveDefaultScope).toBe('global');

    await writeUserConfig({
      defaultAgentSettingsScope: 'project',
      customMarketplaces: [],
      verifiedGithubRepos: [],
    });
    expect(manager.getSchema('claude').effectiveDefaultScope).toBe('project');

    process.env.AGENTINIT_AGENT_DEFAULT_SCOPE = 'local';
    expect(manager.getSchema('claude').effectiveDefaultScope).toBe('local');
  });

  it('rejects unsupported scopes for personal risky settings', async () => {
    const manager = new AgentSettingsManager();

    await expect(
      manager.set('claude', 'skipDangerousModePermissionPrompt', 'true', {
        projectPath,
        scope: 'project',
      }),
    ).rejects.toThrow('does not support project scope');
  });

  it('unsets nested values and removes empty parent objects', async () => {
    const manager = new AgentSettingsManager();

    await manager.set('claude', 'permissions.defaultMode', 'plan', { projectPath });
    await manager.unset('claude', 'permissions.defaultMode', { projectPath });

    await expect(readGlobalSettings()).resolves.toEqual({});
  });

  it('does not write when dry-run is enabled', async () => {
    const manager = new AgentSettingsManager();

    const result = await manager.set('claude', 'model', 'opus[1m]', {
      projectPath,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    await expect(readGlobalSettings()).rejects.toThrow();
  });

  it('rejects raw command-executing and managed Claude settings', async () => {
    const manager = new AgentSettingsManager();

    await expect(manager.set('claude', 'hooks', '{"PreToolUse":[]}', { projectPath, parseJson: true }))
      .rejects.toThrow('Unknown claude setting: hooks');
    await expect(manager.set('claude', 'sandbox', '{"enabled":true}', { projectPath, parseJson: true }))
      .rejects.toThrow('Unknown claude setting: sandbox');
    await expect(manager.set('claude', 'statusLine', '{"type":"command","command":"whoami"}', { projectPath, parseJson: true }))
      .rejects.toThrow('Unknown claude setting: statusLine');
    await expect(manager.set('claude', 'enabledPlugins', '{"plugin":true}', { projectPath, parseJson: true }))
      .rejects.toThrow('Unknown claude setting: enabledPlugins');
  });

  it('adds, lists, and removes typed Claude command hooks', async () => {
    const manager = new AgentSettingsManager();

    await manager.addHook('claude', 'after-tool-use', 'npm run lint', {
      projectPath,
      matcher: 'Edit|Write',
      name: 'lint-after-edit',
    });

    await expect(readGlobalSettings()).resolves.toEqual({
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

    await expect(manager.listHooks('claude', 'post-tool-use', { projectPath })).resolves.toEqual([
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
    ]);

    await manager.removeHook('claude', 'PostToolUse', 'lint-after-edit', { projectPath, matcher: 'Edit|Write' });

    await expect(readGlobalSettings()).resolves.toEqual({});
  });

  it('preserves unrelated hooks when adding and removing hooks', async () => {
    const manager = new AgentSettingsManager();

    await manager.addHook('claude', 'pre-tool-use', 'echo pre', { projectPath, matcher: 'Bash' });
    await manager.addHook('claude', 'post-tool-use', 'echo post', { projectPath });
    await manager.removeHook('claude', 'post-tool-use', 'echo post', { projectPath });

    await expect(readGlobalSettings()).resolves.toEqual({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: 'echo pre',
              },
            ],
          },
        ],
      },
    });
  });

  it('preserves unknown hook fields while appending new hooks', async () => {
    const manager = new AgentSettingsManager();
    const settingsPath = join(process.env.HOME!, '.claude', 'settings.json');
    await mkdir(join(process.env.HOME!, '.claude'), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit',
            customMatcherField: true,
            hooks: [
              {
                type: 'command',
                command: 'echo existing',
                timeout: 1000,
              },
            ],
          },
        ],
      },
    }, null, 2));

    await manager.addHook('claude', 'post-tool-use', 'echo next', { projectPath, matcher: 'Edit' });

    await expect(readGlobalSettings()).resolves.toEqual({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit',
            customMatcherField: true,
            hooks: [
              {
                type: 'command',
                command: 'echo existing',
                timeout: 1000,
              },
              {
                type: 'command',
                command: 'echo next',
              },
            ],
          },
        ],
      },
    });
  });

  it('preserves existing non-command hook types while adding and removing command hooks', async () => {
    const manager = new AgentSettingsManager();
    const settingsPath = join(process.env.HOME!, '.claude', 'settings.json');
    await mkdir(join(process.env.HOME!, '.claude'), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit',
            hooks: [
              {
                type: 'prompt',
                prompt: 'Summarize the changes before continuing.',
              },
              {
                type: 'command',
                command: 'echo existing',
                name: 'existing-command',
              },
            ],
          },
        ],
      },
    }, null, 2));

    await expect(manager.listHooks('claude', 'post-tool-use', { projectPath })).resolves.toEqual([
      {
        matcher: 'Edit',
        hooks: [
          {
            type: 'prompt',
            prompt: 'Summarize the changes before continuing.',
          },
          {
            type: 'command',
            command: 'echo existing',
            name: 'existing-command',
          },
        ],
      },
    ]);

    await manager.addHook('claude', 'post-tool-use', 'echo next', { projectPath, matcher: 'Edit' });
    await manager.removeHook('claude', 'post-tool-use', 'existing-command', { projectPath, matcher: 'Edit' });

    await expect(readGlobalSettings()).resolves.toEqual({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit',
            hooks: [
              {
                type: 'prompt',
                prompt: 'Summarize the changes before continuing.',
              },
              {
                type: 'command',
                command: 'echo next',
              },
            ],
          },
        ],
      },
    });
  });

  it('rejects dangerous permission modes and object values without explicit JSON parsing', async () => {
    const manager = new AgentSettingsManager();

    await expect(manager.set('claude', 'permissions.defaultMode', 'bypassPermissions', { projectPath }))
      .rejects.toThrow('must be one of: default, acceptEdits, plan');
    await expect(manager.set('claude', 'env', '{"AGENTINIT_TEST":"1"}', { projectPath }))
      .rejects.toThrow('Use --value-json');
  });

  it('exposes the Claude schema without raw command-executing or managed settings', () => {
    const manager = new AgentSettingsManager();
    const schema = manager.getSchema('claude');
    const keys = schema.settings.map(setting => setting.key);

    expect(keys).toContain('model');
    expect(keys).toContain('env');
    expect(keys).toContain('alwaysThinkingEnabled');
    expect(keys).toContain('skipDangerousModePermissionPrompt');
    expect(keys).not.toContain('hooks');
    expect(keys).not.toContain('sandbox');
    expect(keys).not.toContain('statusLine');
    expect(keys).not.toContain('enabledPlugins');
    expect(keys).not.toContain('extraKnownMarketplaces');
    expect(keys).not.toContain('allowedMcpServers');
    expect(keys).not.toContain('deniedMcpServers');
  });
});
