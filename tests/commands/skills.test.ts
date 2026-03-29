import { Command } from 'commander';
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
