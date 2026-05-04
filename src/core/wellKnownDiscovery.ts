import { fetchWithTimeout } from '../utils/http.js';

export interface WellKnownSkill {
  name: string;
  description?: string;
  source: string;
  version?: string;
  author?: string;
}

export interface WellKnownIndex {
  skills: WellKnownSkill[];
}

const WELL_KNOWN_PATHS = [
  '/.well-known/agent-skills/index.json',
  '/.well-known/skills/index.json',
];

export class WellKnownDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WellKnownDiscoveryError';
  }
}

export class WellKnownDiscovery {
  /**
   * Discover skills from a well-known endpoint.
   * Tries standard paths and falls back gracefully.
   */
  async discover(baseUrl: string): Promise<WellKnownSkill[]> {
    const normalized = baseUrl.replace(/\/$/, '');

    const errors: string[] = [];
    for (const path of WELL_KNOWN_PATHS) {
      const url = `${normalized}${path}`;
      try {
        const response = await fetchWithTimeout(url, { timeout: 10000 });
        if (!response.ok) {
          errors.push(`${url}: ${response.status} ${response.statusText}`);
          continue;
        }
        const data = (await response.json()) as WellKnownIndex;
        if (!data.skills || !Array.isArray(data.skills)) {
          errors.push(`${url}: invalid response structure`);
          continue;
        }
        return this.validateSkills(data.skills, url);
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    throw new WellKnownDiscoveryError(
      `Failed to discover skills from ${normalized}. Attempted paths:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }

  private validateSkills(skills: unknown[], url: string): WellKnownSkill[] {
    return skills.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new WellKnownDiscoveryError(`${url}: skill at index ${index} must be an object`);
      }

      const skill = entry as Record<string, unknown>;
      const name = typeof skill.name === 'string' ? skill.name.trim() : '';
      const source = typeof skill.source === 'string' ? skill.source.trim() : '';
      if (!name || !source) {
        throw new WellKnownDiscoveryError(`${url}: skill at index ${index} must include string name and source`);
      }

      return {
        name,
        source,
        ...(typeof skill.description === 'string' ? { description: skill.description } : {}),
        ...(typeof skill.version === 'string' ? { version: skill.version } : {}),
        ...(typeof skill.author === 'string' ? { author: skill.author } : {}),
      };
    });
  }
}
