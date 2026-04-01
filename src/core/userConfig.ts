import { existsSync, readFileSync } from 'fs';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { writeFile } from '../utils/fs.js';

export interface CustomMarketplaceConfig {
  identifier: string;
  name: string;
  repoUrl: string;
}

export interface AgentInitUserConfig {
  defaultMarketplace?: string | undefined;
  customMarketplaces: CustomMarketplaceConfig[];
  verifiedGithubRepos: string[];
}

const MARKETPLACE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const GITHUB_REPO_PATTERN = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/;
const GIT_REPO_URL_PATTERN = /^(https?:\/\/|ssh:\/\/|git@).+/;

export const BUILTIN_VERIFIED_GITHUB_REPOS = ['openai/codex-plugin-cc'] as const;

export function getUserConfigPath(): string {
  return join(homedir(), '.agentinit', 'config.json');
}

export function createDefaultUserConfig(): AgentInitUserConfig {
  return {
    customMarketplaces: [],
    verifiedGithubRepos: [],
  };
}

export function normalizeMarketplaceIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  if (!MARKETPLACE_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error('Invalid marketplace identifier. Use lowercase letters, numbers, ".", "_" or "-".');
  }

  return normalized;
}

export function normalizeMarketplaceName(name: string | undefined, identifier: string): string {
  const normalized = name?.trim();
  return normalized ? normalized : identifier;
}

export function normalizeMarketplaceRepoUrl(repoUrl: string): string {
  const normalized = repoUrl.trim().replace(/\/+$/, '');
  if (!normalized || !GIT_REPO_URL_PATTERN.test(normalized)) {
    throw new Error('Invalid marketplace repo URL. Use https://..., ssh://..., or git@...');
  }

  return normalized;
}

export function normalizeGitHubRepoRef(repo: string): string {
  const normalized = repo.trim();
  const match = normalized.match(GITHUB_REPO_PATTERN);
  if (!match) {
    throw new Error('Invalid GitHub repo. Use exact owner/repo.');
  }

  return `${match[1]!.toLowerCase()}/${match[2]!.toLowerCase()}`;
}

function sanitizeCustomMarketplaceConfig(entry: unknown): CustomMarketplaceConfig | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  const candidate = entry as Record<string, unknown>;

  try {
    const identifier = normalizeMarketplaceIdentifier(String(candidate.identifier || ''));
    return {
      identifier,
      name: normalizeMarketplaceName(
        typeof candidate.name === 'string' ? candidate.name : undefined,
        identifier,
      ),
      repoUrl: normalizeMarketplaceRepoUrl(String(candidate.repoUrl || '')),
    };
  } catch {
    return null;
  }
}

export function sanitizeUserConfig(raw: unknown): AgentInitUserConfig {
  const defaults = createDefaultUserConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }

  const parsed = raw as Record<string, unknown>;
  const seenMarketplaces = new Set<string>();
  const customMarketplaces: CustomMarketplaceConfig[] = [];

  if (Array.isArray(parsed.customMarketplaces)) {
    for (const entry of parsed.customMarketplaces) {
      const sanitized = sanitizeCustomMarketplaceConfig(entry);
      if (!sanitized || seenMarketplaces.has(sanitized.identifier)) {
        continue;
      }

      seenMarketplaces.add(sanitized.identifier);
      customMarketplaces.push(sanitized);
    }
  }

  const seenRepos = new Set<string>();
  const verifiedGithubRepos: string[] = [];

  if (Array.isArray(parsed.verifiedGithubRepos)) {
    for (const entry of parsed.verifiedGithubRepos) {
      if (typeof entry !== 'string') {
        continue;
      }

      try {
        const normalized = normalizeGitHubRepoRef(entry);
        if (seenRepos.has(normalized)) {
          continue;
        }
        seenRepos.add(normalized);
        verifiedGithubRepos.push(normalized);
      } catch {
        continue;
      }
    }
  }

  let defaultMarketplace: string | undefined;
  if (typeof parsed.defaultMarketplace === 'string') {
    try {
      defaultMarketplace = normalizeMarketplaceIdentifier(parsed.defaultMarketplace);
    } catch {
      defaultMarketplace = undefined;
    }
  }

  return {
    ...(defaultMarketplace ? { defaultMarketplace } : {}),
    customMarketplaces,
    verifiedGithubRepos,
  };
}

export function readUserConfigSync(): AgentInitUserConfig {
  const configPath = getUserConfigPath();
  if (!existsSync(configPath)) {
    return createDefaultUserConfig();
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    return sanitizeUserConfig(JSON.parse(content) as unknown);
  } catch {
    return createDefaultUserConfig();
  }
}

export async function readUserConfig(): Promise<AgentInitUserConfig> {
  const configPath = getUserConfigPath();
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return sanitizeUserConfig(JSON.parse(content) as unknown);
  } catch {
    return createDefaultUserConfig();
  }
}

export async function writeUserConfig(config: AgentInitUserConfig): Promise<void> {
  const sanitized = sanitizeUserConfig(config);
  await writeFile(getUserConfigPath(), `${JSON.stringify(sanitized, null, 2)}\n`);
}

export function getBuiltInVerifiedGithubRepos(): string[] {
  return [...BUILTIN_VERIFIED_GITHUB_REPOS];
}

export function getEffectiveVerifiedGithubReposSync(): string[] {
  const repos = new Set<string>(BUILTIN_VERIFIED_GITHUB_REPOS);
  for (const repo of readUserConfigSync().verifiedGithubRepos) {
    repos.add(repo);
  }
  return [...repos];
}

export function isVerifiedGitHubRepoSync(owner: string, repo: string): boolean {
  const normalized = normalizeGitHubRepoRef(`${owner}/${repo}`);
  return getEffectiveVerifiedGithubReposSync().includes(normalized);
}
