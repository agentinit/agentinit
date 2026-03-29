import { join } from 'path';
import { AgentManager } from './agentManager.js';
import { SkillsManager } from './skillsManager.js';
import { fileExists } from '../utils/fs.js';
import { ManagedStateStore } from './managedState.js';
import type { Agent } from '../agents/Agent.js';
import type { SkillInfo } from '../types/skills.js';

const PROJECT_SKILL_SOURCE_DIRS = [
  '.agentinit/skills',
  'skills',
];

export interface ProjectSkillsResult {
  discovered: number;
  sources: string[];
  installed: Array<{ skill: SkillInfo; agent: string; path: string }>;
  skipped: Array<{ skill: SkillInfo; reason: string }>;
}

async function discoverProjectSkills(
  projectPath: string,
  skillsManager: SkillsManager
): Promise<{ sources: string[]; skills: SkillInfo[] }> {
  const sources: string[] = [];
  const skills = new Map<string, SkillInfo>();

  for (const sourceDir of PROJECT_SKILL_SOURCE_DIRS) {
    const absoluteSourceDir = join(projectPath, sourceDir);
    if (!(await fileExists(absoluteSourceDir))) {
      continue;
    }

    sources.push(absoluteSourceDir);
    const discovered = await skillsManager.discoverSkills(absoluteSourceDir);
    for (const skill of discovered) {
      const key = skill.name.toLowerCase();
      if (!skills.has(key)) {
        skills.set(key, skill);
      }
    }
  }

  return {
    sources,
    skills: [...skills.values()],
  };
}

export async function applyProjectSkills(
  projectPath: string,
  targetAgentIds: string[],
  managedState: ManagedStateStore,
  options: { dryRun?: boolean } = {},
): Promise<ProjectSkillsResult> {
  const agentManager = new AgentManager();
  const skillsManager = new SkillsManager(agentManager);
  const { sources, skills } = await discoverProjectSkills(projectPath, skillsManager);

  const installed: Array<{ skill: SkillInfo; agent: string; path: string }> = [];
  const skipped: Array<{ skill: SkillInfo; reason: string }> = [];

  if (skills.length === 0) {
    return {
      discovered: 0,
      sources,
      installed,
      skipped,
    };
  }

  const targetAgents = targetAgentIds
    .map(id => agentManager.getAgentById(id))
    .filter((agent): agent is Agent => !!agent);

  if (targetAgents.length === 0) {
    return {
      discovered: skills.length,
      sources,
      installed,
      skipped: skills.map(skill => ({ skill, reason: 'No target agents found' })),
    };
  }

  const dirToAgents = new Map<string, Agent[]>();
  for (const agent of targetAgents) {
    if (!agent.supportsSkills()) {
      for (const skill of skills) {
        skipped.push({ skill, reason: `${agent.name} does not support skills` });
      }
      continue;
    }

    const skillsDir = agent.getSkillsDir(projectPath, false);
    if (!skillsDir) {
      for (const skill of skills) {
        skipped.push({ skill, reason: `No skills directory for ${agent.name}` });
      }
      continue;
    }

    const existing = dirToAgents.get(skillsDir) || [];
    existing.push(agent);
    dirToAgents.set(skillsDir, existing);
  }

  for (const [skillsDir, dirAgents] of dirToAgents) {
    for (const skill of skills) {
      try {
        const installPath = skillsManager.getInstallPath(skill.name, skillsDir);
        if (!options.dryRun) {
          await managedState.trackGeneratedPath(installPath, {
            kind: 'directory',
            source: 'skills',
            ignorePath: `${skillsDir}/`,
          });
        }

        const installedPath = options.dryRun
          ? installPath
          : await skillsManager.installSkill(
            skill.path,
            skill.name,
            skillsDir,
            true,
          );

        for (const agent of dirAgents) {
          installed.push({ skill, agent: agent.id, path: installedPath });
        }
      } catch (error: any) {
        skipped.push({ skill, reason: error.message });
      }
    }
  }

  return {
    discovered: skills.length,
    sources,
    installed,
    skipped,
  };
}
