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
   * Discover skills from a direct index URL or a site's well-known endpoints.
   */
  async discover(baseUrl: string): Promise<WellKnownSkill[]> {
    const urls = this.getCandidateUrls(baseUrl);

    const errors: string[] = [];
    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url, { timeout: 10000 });
        if (!response.ok) {
          errors.push(`${url}: ${response.status} ${response.statusText}`);
          continue;
        }
        const data = await response.json();
        const parsed = this.parseIndex(data);
        if (!parsed) {
          errors.push(`${url}: invalid response structure`);
          continue;
        }
        return parsed.skills;
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    throw new WellKnownDiscoveryError(
      `Failed to discover skills from ${baseUrl}. Attempted URLs:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }

  private getCandidateUrls(source: string): string[] {
    let parsed: URL;
    try {
      parsed = new URL(source);
    } catch {
      throw new WellKnownDiscoveryError(`Invalid URL: ${source}`);
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new WellKnownDiscoveryError(`Unsupported URL protocol: ${parsed.protocol}`);
    }

    const urls: string[] = [];
    const normalizedInput = parsed.toString();
    const path = parsed.pathname.replace(/\/+$/, '');

    if (path && path !== '/') {
      urls.push(normalizedInput);
    }

    for (const wellKnownPath of WELL_KNOWN_PATHS) {
      urls.push(new URL(wellKnownPath, parsed.origin).toString());
    }

    return [...new Set(urls)];
  }

  private parseIndex(value: unknown): WellKnownIndex | null {
    if (!value || typeof value !== 'object' || !('skills' in value) || !Array.isArray(value.skills)) {
      return null;
    }

    const skills: WellKnownSkill[] = [];
    for (const item of value.skills) {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
        return null;
      }
      if (typeof candidate.source !== 'string' || !candidate.source.trim()) {
        return null;
      }

      skills.push({
        name: candidate.name.trim(),
        source: candidate.source.trim(),
        ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
        ...(typeof candidate.version === 'string' ? { version: candidate.version } : {}),
        ...(typeof candidate.author === 'string' ? { author: candidate.author } : {}),
      });
    }

    return { skills };
  }
}
