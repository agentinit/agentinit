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
        return data.skills;
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    throw new WellKnownDiscoveryError(
      `Failed to discover skills from ${normalized}. Attempted paths:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }

  /**
   * Check if a URL looks like a well-known endpoint (not a git repo or local path).
   */
  static isWellKnownUrl(source: string): boolean {
    if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
      return false;
    }
    if (source.includes('.git') || source.startsWith('git@')) {
      return false;
    }
    if (source.match(/^\w+:\/\//)) {
      return true;
    }
    return false;
  }
}
