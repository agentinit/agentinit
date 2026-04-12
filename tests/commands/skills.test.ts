import { Command } from 'commander';
import { homedir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSkillsCommand } from '../../src/commands/skills.js';
import { SkillsManager } from '../../src/core/skillsManager.js';
import { MultipleBundlePluginsError } from '../../src/core/pluginManager.js';
import { AgentManager } from '../../src/core/agentManager.js';
import { SHARED_SKILLS_TARGET_ID, SHARED_SKILLS_TARGET_NAME } from '../../src/types/skills.js';
import { logger } from '../../src/utils/logger.js';

const { promptsMock, oraMock, spinner } = vi.hoisted(() => {
  const spinner = {
    start: vi.fn(),
    stop: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  };

  spinner.start.mockReturnValue(spinner);

  return {
    promptsMock: vi.fn(),
    oraMock: vi.fn(() => spinner),
    spinner,
  };
});

vi.mock('prompts', () => ({
  default: promptsMock,
}));

vi.mock('ora', () => ({
  default: oraMock,
}));

const TEST_GITHUB_SKILL_REPO = 'agentinit-labs/test-skills-repo';
const TEST_GITHUB_SKILL_SOURCE = `${TEST_GITHUB_SKILL_REPO}/nothing-design`;

describe('skills command', () => {
  function formatPromptPath(path: string): string {
    const normalizedPath = path.replace(/\\/g, '/').replace(/\/?$/, '/');
    const normalizedHome = homedir().replace(/\\/g, '/');

    if (normalizedPath === `${normalizedHome}/`) {
      return '~/';
    }

    if (normalizedPath.startsWith(`${normalizedHome}/`)) {
      return normalizedPath.replace(normalizedHome, '~');
    }

    return normalizedPath;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    promptsMock.mockReset();
    oraMock.mockClear();
    spinner.start.mockClear();
    spinner.stop.mockClear();
    spinner.info.mockClear();
    spinner.warn.mockClear();
    spinner.succeed.mockClear();
    spinner.fail.mockClear();
    spinner.start.mockReturnValue(spinner);
  });

  it('prompts for a global target when no project agents are detected', async () => {
    vi.spyOn(AgentManager.prototype, 'detectAgents').mockResolvedValue([]);
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [],
      warnings: [],
    });
    const addFromSourceSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [
        {
          skill: {
            name: 'skill-creator',
            description: 'Create skills',
            path: '/tmp/skill-creator',
          },
          agent: 'claude',
          path: '/tmp/.claude/skills/skill-creator',
          mode: 'copy',
        },
      ],
      updated: [],
      unchanged: [],
      skipped: [],
      warnings: [],
    });

    promptsMock
      .mockResolvedValueOnce({ scope: 'global' })
      .mockResolvedValueOnce({ groups: [['claude']] });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/skill-creator'], { from: 'user' });

    expect(addFromSourceSpy).toHaveBeenCalledWith(
      'claude/skill-creator',
      process.cwd(),
      expect.objectContaining({
        global: true,
        agents: ['claude'],
      }),
    );
  });

  it('asks for project scope first and then project agent selection', async () => {
    vi.spyOn(AgentManager.prototype, 'detectAgents').mockResolvedValue([
      {
        agent: new AgentManager().getAgentById('claude')!,
        configPath: '/tmp/project/CLAUDE.md',
      },
    ]);
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [],
      warnings: [],
    });
    const addFromSourceSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [
        {
          skill: {
            name: 'skill-creator',
            description: 'Create skills',
            path: '/tmp/skill-creator',
          },
          agent: 'claude',
          path: '/tmp/project/.claude/skills/skill-creator',
          mode: 'copy',
        },
      ],
      updated: [],
      unchanged: [],
      skipped: [],
      warnings: [],
    });

    promptsMock
      .mockResolvedValueOnce({ scope: 'project' })
      .mockResolvedValueOnce({ groups: [['claude']] });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/skill-creator'], { from: 'user' });

    expect(addFromSourceSpy).toHaveBeenCalledWith(
      'claude/skill-creator',
      process.cwd(),
      expect.objectContaining({
        agents: ['claude'],
      }),
    );
    expect(addFromSourceSpy.mock.calls[0]?.[2]).not.toHaveProperty('global');
  });

  it('shows install locations in the scope selection prompt', async () => {
    vi.spyOn(AgentManager.prototype, 'detectAgents').mockResolvedValue([
      {
        agent: new AgentManager().getAgentById('claude')!,
        configPath: '/tmp/project/CLAUDE.md',
      },
    ]);
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [],
      warnings: [],
    });
    vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [
        {
          skill: {
            name: 'skill-creator',
            description: 'Create skills',
            path: '/tmp/skill-creator',
          },
          agent: 'claude',
          path: '/tmp/project/.claude/skills/skill-creator',
          mode: 'copy',
        },
      ],
      updated: [],
      unchanged: [],
      skipped: [],
      warnings: [],
    });

    let scopePrompt: Record<string, any> | undefined;
    promptsMock
      .mockImplementationOnce(async prompt => {
        scopePrompt = prompt as Record<string, any>;
        return { scope: 'project' };
      })
      .mockResolvedValueOnce({ groups: [['claude']] });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/skill-creator'], { from: 'user' });

    expect(scopePrompt?.choices).toEqual([
      {
        title: 'This project',
        value: 'project',
        description: formatPromptPath(process.cwd()),
      },
      {
        title: 'Globally',
        value: 'global',
        description: '~/.agents/skills/',
      },
    ]);
  });

  it('shows the canonical global skills store first and preselected in the global selection prompt', async () => {
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [],
      warnings: [],
    });
    vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [
        {
          skill: {
            name: 'frontend-design',
            description: 'Build distinctive interfaces',
            path: '/tmp/frontend-design',
          },
          agent: SHARED_SKILLS_TARGET_ID,
          path: '/tmp/.agents/skills/frontend-design',
          canonicalPath: '/tmp/.agents/skills/frontend-design',
          mode: 'symlink',
        },
      ],
      updated: [],
      unchanged: [],
      skipped: [],
      warnings: [],
    });

    let groupsPrompt: Record<string, any> | undefined;
    promptsMock
      .mockResolvedValueOnce({ scope: 'global' })
      .mockImplementationOnce(async prompt => {
        groupsPrompt = prompt as Record<string, any>;
        return { groups: [[SHARED_SKILLS_TARGET_ID]] };
      });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/frontend-design'], { from: 'user' });

    expect(groupsPrompt?.choices[0]?.title).toBe(`~/.agents/skills/ -> ${SHARED_SKILLS_TARGET_NAME}`);
    expect(groupsPrompt?.choices[0]?.description).toContain('shared AGENTS.md store');
    expect(groupsPrompt?.choices[0]?.selected).toBe(true);
    expect(groupsPrompt?.choices.some((choice: Record<string, any>) => choice.title.startsWith('~/.claude/skills/ -> Claude Code, Claude Desktop'))).toBe(true);
    expect(groupsPrompt?.choices.some((choice: Record<string, any>) => choice.title.startsWith('~/.codex/skills/ -> OpenAI Codex CLI'))).toBe(true);
    expect(groupsPrompt?.choices.some((choice: Record<string, any>) => choice.title.startsWith('~/.openclaw/skills/ -> OpenClaw'))).toBe(true);
    expect(groupsPrompt?.choices.some((choice: Record<string, any>) => choice.title.startsWith('~/.hermes/skills/ -> Hermes'))).toBe(true);
    expect(groupsPrompt?.choices.find((choice: Record<string, any>) => choice.title.startsWith('~/.claude/skills/ -> Claude Code, Claude Desktop'))?.selected).toBe(true);
  });

  it('passes the shared AGENTS target without expanding it into compatible agents', async () => {
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [],
      warnings: [],
    });
    const addFromSourceSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [
        {
          skill: {
            name: 'nothing-design',
            description: 'Nothing style',
            path: '/tmp/nothing-design',
          },
          agent: SHARED_SKILLS_TARGET_ID,
          path: '/tmp/.agents/skills/nothing-design',
          canonicalPath: '/tmp/.agents/skills/nothing-design',
          mode: 'symlink',
        },
      ],
      updated: [],
      unchanged: [],
      skipped: [],
      warnings: [],
    });

    promptsMock
      .mockResolvedValueOnce({ scope: 'global' })
      .mockResolvedValueOnce({ groups: [[SHARED_SKILLS_TARGET_ID]] });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_SOURCE], { from: 'user' });

    expect(addFromSourceSpy).toHaveBeenCalledWith(
      TEST_GITHUB_SKILL_SOURCE,
      process.cwd(),
      expect.objectContaining({
        global: true,
        agents: [SHARED_SKILLS_TARGET_ID],
      }),
    );
  });

  it('prompts for skill selection when a source contains multiple skills', async () => {
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [
        {
          name: 'ascii-art',
          description: 'Create ASCII art',
          path: '/tmp/ascii-art',
        },
        {
          name: 'ideation',
          description: 'Generate creative ideas',
          path: '/tmp/ideation',
        },
      ],
      warnings: [],
    });
    const addFromSourceSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [],
      updated: [],
      unchanged: [],
      skipped: [],
      warnings: [],
    });

    let skillsPrompt: Record<string, any> | undefined;
    promptsMock
      .mockImplementationOnce(async prompt => {
        skillsPrompt = prompt as Record<string, any>;
        return { skills: ['ascii-art'] };
      })
      .mockResolvedValueOnce({ scope: 'global' })
      .mockResolvedValueOnce({ groups: [[SHARED_SKILLS_TARGET_ID]] });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_REPO], { from: 'user' });

    expect(skillsPrompt).toEqual(expect.objectContaining({
      type: 'multiselect',
      name: 'skills',
      message: 'Select skills to install (2 found):',
    }));
    expect(skillsPrompt?.choices).toEqual([
      {
        title: 'ascii-art',
        value: 'ascii-art',
        description: 'Create ASCII art',
        selected: true,
      },
      {
        title: 'ideation',
        value: 'ideation',
        description: 'Generate creative ideas',
        selected: true,
      },
    ]);
    expect(addFromSourceSpy).toHaveBeenCalledWith(
      TEST_GITHUB_SKILL_REPO,
      process.cwd(),
      expect.objectContaining({
        global: true,
        agents: [SHARED_SKILLS_TARGET_ID],
        skills: ['ascii-art'],
      }),
    );
  });

  it('cancels installation when the skill selection prompt is dismissed', async () => {
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [
        {
          name: 'ascii-art',
          description: 'Create ASCII art',
          path: '/tmp/ascii-art',
        },
        {
          name: 'ideation',
          description: 'Generate creative ideas',
          path: '/tmp/ideation',
        },
      ],
      warnings: [],
    });
    const discardSpy = vi.spyOn(SkillsManager.prototype, 'discardPreparedSource').mockResolvedValue();
    const addFromSourceSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource');

    promptsMock.mockResolvedValueOnce({});

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_REPO], { from: 'user' });

    expect(discardSpy).toHaveBeenCalledWith(
      TEST_GITHUB_SKILL_REPO,
      process.cwd(),
      expect.objectContaining({}),
    );
    expect(addFromSourceSpy).not.toHaveBeenCalled();
  });

  it('shows install status previews in the selection prompt including new installs', async () => {
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [
        {
          name: 'playground',
          description: 'Interactive playground',
          path: '/tmp/playground',
        },
      ],
      warnings: [],
    });
    vi.spyOn(SkillsManager.prototype, 'previewInstallStatus').mockImplementation(async (_skill, _projectPath, options) => {
      if (options?.sharedStore) {
        return 'unchanged';
      }
      if (options?.agent?.id === 'claude') {
        return 'changed';
      }
      return 'new';
    });
    vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [],
      updated: [],
      unchanged: [],
      skipped: [],
      warnings: [],
    });

    let groupsPrompt: Record<string, any> | undefined;
    promptsMock
      .mockResolvedValueOnce({ scope: 'global' })
      .mockImplementationOnce(async prompt => {
        groupsPrompt = prompt as Record<string, any>;
        return { groups: [[SHARED_SKILLS_TARGET_ID], ['claude']] };
      });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/playground'], { from: 'user' });

    expect(groupsPrompt?.choices[0]?.description).toBe('Already up to date: playground');
    expect(groupsPrompt?.choices.find((choice: Record<string, any>) => choice.title.startsWith('~/.claude/skills/ -> Claude Code, Claude Desktop'))?.description).toBe('Update available: playground');
    expect(groupsPrompt?.choices.find((choice: Record<string, any>) => choice.title.startsWith('~/.codex/skills/ -> OpenAI Codex CLI'))?.description).toBe('Will install: playground');
  });

  it('shows actionable guidance when --yes leaves skills add with no target agents', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [],
      warnings: [],
    });
    vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [],
      updated: [],
      unchanged: [],
      skipped: [
        {
          skill: {
            name: 'skill-creator',
            description: 'Create skills',
            path: '/tmp/skill-creator',
          },
          reason: 'No target agents found',
        },
      ],
      warnings: [],
    });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/skill-creator', '--yes'], { from: 'user' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('No install target was resolved automatically.');
    expect(infoSpy).toHaveBeenCalledWith('  agentinit skills add claude/skill-creator --agent claude');
    expect(infoSpy).toHaveBeenCalledWith('  agentinit skills add claude/skill-creator --global --agent claude');
    expect(infoSpy).toHaveBeenCalledWith('  agentinit init');
  });

  it('fails without prompting when --yes hits a multi-plugin bundle source', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const bundleError = new MultipleBundlePluginsError('/tmp/test', [
      { name: 'alpha', source: './plugins/alpha' },
      { name: 'beta', source: './plugins/beta' },
    ]);

    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockRejectedValue(bundleError);
    const addSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource');

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_SOURCE, '--yes'], { from: 'user' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(spinner.fail).toHaveBeenCalledWith('Failed to verify skill source');
    expect(errorSpy).toHaveBeenCalledWith(`Error: ${bundleError.message}`);
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('fails before prompting when source verification fails', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockRejectedValue(new Error('Repository not found'));

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_SOURCE], { from: 'user' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(spinner.fail).toHaveBeenCalledWith('Failed to verify skill source');
    expect(errorSpy).toHaveBeenCalledWith('Error: Repository not found');
  });

  it('passes an update confirmation callback that prompts before overwriting changed skills', async () => {
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [],
      warnings: [],
    });

    let confirmUpdate: ((skills: Array<{ name: string; description: string; path: string }>) => Promise<Array<{ name: string; description: string; path: string }>>) | undefined;
    vi.spyOn(SkillsManager.prototype, 'addFromSource').mockImplementation(async (_source, _cwd, options) => {
      confirmUpdate = options?.confirmUpdate;
      return {
        installed: [],
        updated: [],
        unchanged: [],
        skipped: [],
        warnings: [],
      };
    });

    promptsMock.mockResolvedValueOnce({ update: true });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/skill-creator', '--agent', 'claude'], { from: 'user' });

    expect(confirmUpdate).toBeTypeOf('function');
    const selected = await confirmUpdate!([
      {
        name: 'skill-creator',
        description: 'Create skills',
        path: '/tmp/skill-creator',
      },
    ]);

    expect(promptsMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'confirm',
      name: 'update',
      message: 'Skill "skill-creator" has been updated. Update it?',
      initial: true,
    }));
    expect(selected).toHaveLength(1);
    expect(selected[0]?.name).toBe('skill-creator');
  });

  it('shows an up-to-date summary when installed skills do not need changes', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockResolvedValue({
      skills: [],
      warnings: [],
    });
    vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [],
      updated: [],
      unchanged: [
        {
          skill: {
            name: 'skill-creator',
            description: 'Create skills',
            path: '/tmp/skill-creator',
          },
          agent: 'claude',
          path: '/tmp/.agents/skills/skill-creator',
        },
      ],
      skipped: [],
      warnings: [],
    });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/skill-creator', '--agent', 'claude'], { from: 'user' });

    expect(spinner.info).toHaveBeenCalledWith('1 skill(s) already up to date');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Already installed: skill-creator'));
  });

  it('uses --all to list every bundled plugin without prompting', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const entries = [
      { name: 'alpha', source: './plugins/alpha' },
      { name: 'beta', source: './plugins/beta' },
    ];
    const bundleError = new MultipleBundlePluginsError('/tmp/test', entries);

    const discoverSourceSpy = vi.spyOn(SkillsManager.prototype, 'discoverFromSource');
    discoverSourceSpy
      .mockRejectedValueOnce(bundleError)
      .mockResolvedValueOnce({ skills: [], warnings: [] })
      .mockResolvedValueOnce({ skills: [], warnings: [] });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync([
      'skills',
      'add',
      TEST_GITHUB_SKILL_SOURCE,
      '--list',
      '--all',
    ], { from: 'user' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('Selecting all bundled plugins (--all).');
    expect(discoverSourceSpy).toHaveBeenNthCalledWith(
      2,
      TEST_GITHUB_SKILL_SOURCE,
      expect.any(String),
      expect.objectContaining({ pluginName: 'alpha' }),
    );
    expect(discoverSourceSpy).toHaveBeenNthCalledWith(
      3,
      TEST_GITHUB_SKILL_SOURCE,
      expect.any(String),
      expect.objectContaining({ pluginName: 'beta' }),
    );
  });

  it('prompts for plugin selection when MultipleBundlePluginsError is thrown', async () => {
    const entries = [
      { name: 'alpha', source: './plugins/alpha' },
      { name: 'beta', source: './plugins/beta' },
    ];
    const bundleError = new MultipleBundlePluginsError('/tmp/test', entries);

    vi.spyOn(AgentManager.prototype, 'detectAgents').mockResolvedValue([]);

    const prepareSourceSpy = vi.spyOn(SkillsManager.prototype, 'prepareSource');
    prepareSourceSpy.mockRejectedValueOnce(bundleError);
    prepareSourceSpy.mockResolvedValueOnce({ skills: [], warnings: [] });

    // Prompts: 1) bundle plugin selection, 2) scope, 3) agent groups
    promptsMock
      .mockResolvedValueOnce({ plugins: ['beta'] })
      .mockResolvedValueOnce({ scope: 'global' })
      .mockResolvedValueOnce({ groups: [['claude']] });

    const addFromSourceSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [],
      updated: [],
      unchanged: [],
      skipped: [],
      warnings: [],
    });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_SOURCE], { from: 'user' });

    expect(promptsMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'multiselect',
      name: 'plugins',
      message: expect.stringContaining('multiple plugins'),
    }));
    expect(prepareSourceSpy).toHaveBeenCalledTimes(2);
    expect(prepareSourceSpy).toHaveBeenLastCalledWith(
      TEST_GITHUB_SKILL_SOURCE,
      expect.any(String),
      expect.objectContaining({ pluginName: 'beta' }),
    );
    expect(addFromSourceSpy).toHaveBeenCalledWith(
      TEST_GITHUB_SKILL_SOURCE,
      expect.any(String),
      expect.objectContaining({ pluginName: 'beta' }),
    );
  });

  it('installs all selected bundle plugins for skills add and shows the selection hint', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const entries = [
      { name: 'alpha', source: './plugins/alpha' },
      { name: 'beta', source: './plugins/beta' },
    ];
    const bundleError = new MultipleBundlePluginsError('/tmp/test', entries);

    const prepareSourceSpy = vi.spyOn(SkillsManager.prototype, 'prepareSource');
    prepareSourceSpy.mockRejectedValueOnce(bundleError);
    prepareSourceSpy
      .mockResolvedValueOnce({ skills: [], warnings: [] })
      .mockResolvedValueOnce({ skills: [], warnings: [] });

    promptsMock.mockResolvedValueOnce({ plugins: ['alpha', 'beta'] });

    const addFromSourceSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource');
    addFromSourceSpy
      .mockResolvedValueOnce({ installed: [], updated: [], unchanged: [], skipped: [], warnings: [] })
      .mockResolvedValueOnce({ installed: [], updated: [], unchanged: [], skipped: [], warnings: [] });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_SOURCE, '--agent', 'claude'], { from: 'user' });

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('A to select or deselect all'));
    expect(prepareSourceSpy).toHaveBeenCalledTimes(3);
    expect(addFromSourceSpy).toHaveBeenNthCalledWith(
      1,
      TEST_GITHUB_SKILL_SOURCE,
      expect.any(String),
      expect.objectContaining({ pluginName: 'alpha', agents: ['claude'] }),
    );
    expect(addFromSourceSpy).toHaveBeenNthCalledWith(
      2,
      TEST_GITHUB_SKILL_SOURCE,
      expect.any(String),
      expect.objectContaining({ pluginName: 'beta', agents: ['claude'] }),
    );
  });

  it('uses --all to install every bundled plugin without prompting, including with --yes', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const entries = [
      { name: 'alpha', source: './plugins/alpha' },
      { name: 'beta', source: './plugins/beta' },
    ];
    const bundleError = new MultipleBundlePluginsError('/tmp/test', entries);

    const prepareSourceSpy = vi.spyOn(SkillsManager.prototype, 'prepareSource');
    prepareSourceSpy.mockRejectedValueOnce(bundleError);
    prepareSourceSpy
      .mockResolvedValueOnce({ skills: [], warnings: [] })
      .mockResolvedValueOnce({ skills: [], warnings: [] });

    const addFromSourceSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource');
    addFromSourceSpy
      .mockResolvedValueOnce({ installed: [], updated: [], unchanged: [], skipped: [], warnings: [] })
      .mockResolvedValueOnce({ installed: [], updated: [], unchanged: [], skipped: [], warnings: [] });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_SOURCE, '--all', '--yes', '--agent', 'claude'], { from: 'user' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('Selecting all bundled plugins (--all).');
    expect(addFromSourceSpy).toHaveBeenNthCalledWith(
      1,
      TEST_GITHUB_SKILL_SOURCE,
      expect.any(String),
      expect.objectContaining({ pluginName: 'alpha', agents: ['claude'], yes: true }),
    );
    expect(addFromSourceSpy).toHaveBeenNthCalledWith(
      2,
      TEST_GITHUB_SKILL_SOURCE,
      expect.any(String),
      expect.objectContaining({ pluginName: 'beta', agents: ['claude'], yes: true }),
    );
  });

  it('cancels when user dismisses bundle plugin selection', async () => {
    const entries = [
      { name: 'alpha', source: './plugins/alpha' },
      { name: 'beta', source: './plugins/beta' },
    ];
    const bundleError = new MultipleBundlePluginsError('/tmp/test', entries);

    vi.spyOn(SkillsManager.prototype, 'prepareSource').mockRejectedValue(bundleError);
    promptsMock.mockResolvedValueOnce({});

    const addSpy = vi.spyOn(SkillsManager.prototype, 'addFromSource');
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', TEST_GITHUB_SKILL_SOURCE], { from: 'user' });

    expect(infoSpy).toHaveBeenCalledWith('Cancelled.');
    expect(addSpy).not.toHaveBeenCalled();
  });
});
