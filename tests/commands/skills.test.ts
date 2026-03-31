import { Command } from 'commander';
import { homedir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSkillsCommand } from '../../src/commands/skills.js';
import { SkillsManager } from '../../src/core/skillsManager.js';
import { AgentManager } from '../../src/core/agentManager.js';
import { logger } from '../../src/utils/logger.js';

const { promptsMock, oraMock, spinner } = vi.hoisted(() => {
  const spinner = {
    start: vi.fn(),
    stop: vi.fn(),
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
    spinner.warn.mockClear();
    spinner.succeed.mockClear();
    spinner.fail.mockClear();
    spinner.start.mockReturnValue(spinner);
  });

  it('prompts for a global target when no project agents are detected', async () => {
    vi.spyOn(AgentManager.prototype, 'detectAgents').mockResolvedValue([]);
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
    vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [
        {
          skill: {
            name: 'frontend-design',
            description: 'Build distinctive interfaces',
            path: '/tmp/frontend-design',
          },
          agent: 'claude',
          path: '/tmp/.claude/skills/frontend-design',
          canonicalPath: '/tmp/.agents/skills/frontend-design',
          mode: 'symlink',
        },
      ],
      skipped: [],
      warnings: [],
    });

    let groupsPrompt: Record<string, any> | undefined;
    promptsMock
      .mockResolvedValueOnce({ scope: 'global' })
      .mockImplementationOnce(async prompt => {
        groupsPrompt = prompt as Record<string, any>;
        return { groups: [['claude']] };
      });

    const program = new Command();
    registerSkillsCommand(program);

    await program.parseAsync(['skills', 'add', 'claude/frontend-design'], { from: 'user' });

    expect(groupsPrompt?.choices[0]?.title).toContain('~/.agents/skills/ ->');
    expect(groupsPrompt?.choices[0]?.description).toContain('AGENTS.md ecosystem');
    expect(groupsPrompt?.choices[0]?.selected).toBe(true);
    expect(groupsPrompt?.choices.some((choice: Record<string, any>) => choice.title.startsWith('~/.claude/skills/ -> Claude Code, Claude Desktop'))).toBe(true);
    expect(groupsPrompt?.choices.some((choice: Record<string, any>) => choice.title.startsWith('~/.codex/skills/ -> OpenAI Codex CLI'))).toBe(true);
    expect(groupsPrompt?.choices.some((choice: Record<string, any>) => choice.title.startsWith('~/.openclaw/skills/ -> OpenClaw'))).toBe(true);
    expect(groupsPrompt?.choices.some((choice: Record<string, any>) => choice.title.startsWith('~/.hermes/skills/ -> Hermes'))).toBe(true);
    expect(groupsPrompt?.choices.find((choice: Record<string, any>) => choice.title.startsWith('~/.claude/skills/ -> Claude Code, Claude Desktop'))?.selected).toBe(true);
  });

  it('shows actionable guidance when --yes leaves skills add with no target agents', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(SkillsManager.prototype, 'addFromSource').mockResolvedValue({
      installed: [],
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
});
