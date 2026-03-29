import { resolve } from 'path';
import type { Agent } from '../agents/Agent.js';

export type ProjectRulesStandard = 'claude' | 'agents';
export type ProjectSkillsStandard = 'claude' | 'agents';

export const PROJECT_RULE_STANDARD_PATHS: Record<ProjectRulesStandard, string> = {
  claude: 'CLAUDE.md',
  agents: 'AGENTS.md',
};

export const PROJECT_SKILL_STANDARD_DIRS: Record<ProjectSkillsStandard, string> = {
  claude: '.claude/skills',
  agents: '.agents/skills',
};

export function getProjectRulesStandardPath(standard: ProjectRulesStandard): string {
  return PROJECT_RULE_STANDARD_PATHS[standard];
}

export function getProjectSkillsStandardDir(projectPath: string, standard: ProjectSkillsStandard): string {
  return resolve(projectPath, PROJECT_SKILL_STANDARD_DIRS[standard]);
}

export function groupAgentsByRulesStandard(agents: Agent[]): Array<{
  standard: ProjectRulesStandard;
  path: string;
  agents: Agent[];
}> {
  const grouped = new Map<ProjectRulesStandard, Agent[]>();

  for (const agent of agents) {
    const standard = agent.getProjectRulesStandard();
    if (!standard) {
      continue;
    }

    const existing = grouped.get(standard) || [];
    existing.push(agent);
    grouped.set(standard, existing);
  }

  return [...grouped.entries()].map(([standard, standardAgents]) => ({
    standard,
    path: getProjectRulesStandardPath(standard),
    agents: standardAgents,
  }));
}

export function groupAgentsBySkillsStandard(projectPath: string, agents: Agent[]): Array<{
  standard: ProjectSkillsStandard;
  path: string;
  agents: Agent[];
}> {
  const grouped = new Map<ProjectSkillsStandard, Agent[]>();

  for (const agent of agents) {
    const standard = agent.getProjectSkillsStandard();
    if (!standard) {
      continue;
    }

    const existing = grouped.get(standard) || [];
    existing.push(agent);
    grouped.set(standard, existing);
  }

  return [...grouped.entries()].map(([standard, standardAgents]) => ({
    standard,
    path: getProjectSkillsStandardDir(projectPath, standard),
    agents: standardAgents,
  }));
}
