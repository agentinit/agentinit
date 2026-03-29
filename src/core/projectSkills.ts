import { dirname, join } from 'path';
import { AgentManager } from './agentManager.js';
import { SkillsManager } from './skillsManager.js';
import { fileExists } from '../utils/fs.js';
import { ManagedStateStore } from './managedState.js';
import type { Agent } from '../agents/Agent.js';
import type { SkillInfo, SkillInstallResult } from '../types/skills.js';

const PROJECT_SKILL_SOURCE_DIRS = [
  '.agentinit/skills',
  'skills',
];

export interface ProjectSkillsResult {
  discovered: number;
  sources: string[];
  installed: Array<{ skill: SkillInfo; agent: string } & SkillInstallResult>;
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
  options: { dryRun?: boolean; copy?: boolean } = {},
): Promise<ProjectSkillsResult> {
  const agentManager = new AgentManager();
  const skillsManager = new SkillsManager(agentManager);
  const { sources, skills } = await discoverProjectSkills(projectPath, skillsManager);

  const installed: Array<{ skill: SkillInfo; agent: string } & SkillInstallResult> = [];
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
  }

  for (const agent of targetAgents) {
    if (!agent.supportsSkills()) continue;
    if (!agent.getSkillsDir(projectPath, false)) continue;

    for (const skill of skills) {
      try {
        const installOptions = {
          ...(options.copy !== undefined ? { copy: options.copy } : {}),
        };
        const installPlan = await skillsManager.getInstallPlan(
          skill.name,
          agent,
          projectPath,
          installOptions,
        );

        if (!options.dryRun) {
          const generatedPaths = new Set(
            [installPlan.path, installPlan.canonicalPath].filter((value): value is string => !!value)
          );

          for (const generatedPath of generatedPaths) {
            await managedState.trackGeneratedPath(generatedPath, {
              kind: 'directory',
              source: 'skills',
              ignorePath: `${dirname(generatedPath)}/`,
            });
          }
        }

        const installResult = options.dryRun
          ? installPlan
          : await skillsManager.installSkillForAgent(
            skill.path,
            skill.name,
            agent,
            projectPath,
            installOptions,
          );

        installed.push({ skill, agent: agent.id, ...installResult });
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
