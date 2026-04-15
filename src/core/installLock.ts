import { promises as fs } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { createHash, randomUUID } from 'crypto';
import { readFileIfExists, fileExists } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import type {
  LockState,
  LockEntry,
  LockAction,
  LockSource,
  LockSkillMeta,
  LockMcpMeta,
  LockRulesMeta,
  LockQueryOptions,
  LockPruneResult,
  LockDriftResult,
} from '../types/lockfile.js';

const LOCK_FILE = 'lock.json';
const GLOBAL_TARGET_KEY = '__agentinit_global__';

function getLockPath(): string {
  return join(homedir(), '.agentinit', LOCK_FILE);
}

function getEntryTargetKey(entry: Pick<LockEntry, 'scope' | 'projectPath'>): string {
  return entry.scope === 'global' ? GLOBAL_TARGET_KEY : entry.projectPath;
}

function createEntry(
  base: Omit<LockEntry, 'id' | 'timestamp'>,
): LockEntry {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...base,
  };
}

function sanitizeUrlForLock(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split(/[?#]/)[0] || url;
  }
}

export function getLockEntryTargetLabel(entry: Pick<LockEntry, 'scope' | 'projectPath'>): string {
  return entry.scope === 'global' ? 'Global scope' : entry.projectPath;
}

export function logLockWriteWarning(context: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : 'unknown error';
  logger.warn(`${context}, but failed to update the install lock: ${detail}`);
}

export async function hashDirectory(rootPath: string): Promise<string | null> {
  if (!(await fileExists(rootPath))) return null;

  const hash = createHash('sha256');

  const walk = async (currentPath: string, relativePath: string): Promise<void> => {
    const stat = await fs.stat(currentPath);

    if (stat.isDirectory()) {
      hash.update(`dir:${relativePath}\n`);
      const entries = await fs.readdir(currentPath);
      entries.sort();
      for (const entry of entries) {
        await walk(join(currentPath, entry), `${relativePath}/${entry}`);
      }
    } else {
      const content = await fs.readFile(currentPath);
      hash.update(`file:${relativePath}\n`);
      hash.update(content);
      hash.update('\n');
    }
  };

  await walk(rootPath, '.');
  return hash.digest('hex');
}

export class InstallLock {
  private state: LockState | null = null;

  async load(): Promise<LockState> {
    if (this.state) return this.state;

    const content = await readFileIfExists(getLockPath());
    if (!content) {
      this.state = { version: 1, entries: [] };
      return this.state;
    }

    try {
      const parsed = JSON.parse(content);
      if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
        this.state = parsed as LockState;
      } else {
        this.state = { version: 1, entries: [] };
      }
    } catch {
      this.state = { version: 1, entries: [] };
    }

    return this.state;
  }

  async save(): Promise<void> {
    if (!this.state) return;
    const lockPath = getLockPath();
    await fs.mkdir(dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify(this.state, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.chmod(lockPath, 0o600).catch(() => {});
  }

  async recordSkill(params: {
    action: LockAction;
    name: string;
    projectPath: string;
    agents: string[];
    scope: 'project' | 'global';
    source: LockSource;
    installPath: string;
    canonicalPath?: string;
    mode: 'copy' | 'symlink';
    contentHash?: string;
  }): Promise<LockEntry> {
    const state = await this.load();

    const metadata: LockSkillMeta = {
      kind: 'skill',
      installPath: params.installPath,
      ...(params.canonicalPath ? { canonicalPath: params.canonicalPath } : {}),
      mode: params.mode,
    };

    const entry = createEntry({
      kind: 'skill',
      action: params.action,
      name: params.name,
      projectPath: resolve(params.projectPath),
      agents: params.agents,
      scope: params.scope,
      source: params.source,
      ...(params.contentHash ? { contentHash: params.contentHash } : {}),
      metadata,
    });

    state.entries.push(entry);
    await this.save();
    return entry;
  }

  async recordMcp(params: {
    action: LockAction;
    name: string;
    projectPath: string;
    agents: string[];
    scope: 'project' | 'global';
    source: LockSource;
    configPath: string;
    serverType: 'stdio' | 'http' | 'sse';
    command?: string;
    url?: string;
  }): Promise<LockEntry> {
    const state = await this.load();

    const metadata: LockMcpMeta = {
      kind: 'mcp',
      configPath: params.configPath,
      serverType: params.serverType,
      ...(params.command ? { command: params.command } : {}),
      ...(params.url ? { url: sanitizeUrlForLock(params.url) } : {}),
    };

    const entry = createEntry({
      kind: 'mcp',
      action: params.action,
      name: params.name,
      projectPath: resolve(params.projectPath),
      agents: params.agents,
      scope: params.scope,
      source: params.source,
      metadata,
    });

    state.entries.push(entry);
    await this.save();
    return entry;
  }

  async recordRules(params: {
    action: LockAction;
    name: string;
    projectPath: string;
    agents: string[];
    scope: 'project' | 'global';
    source: LockSource;
    configPath: string;
    templateIds: string[];
    ruleCount: number;
  }): Promise<LockEntry> {
    const state = await this.load();

    const metadata: LockRulesMeta = {
      kind: 'rules',
      configPath: params.configPath,
      templateIds: params.templateIds,
      ruleCount: params.ruleCount,
    };

    const entry = createEntry({
      kind: 'rules',
      action: params.action,
      name: params.name,
      projectPath: resolve(params.projectPath),
      agents: params.agents,
      scope: params.scope,
      source: params.source,
      metadata,
    });

    state.entries.push(entry);
    await this.save();
    return entry;
  }

  async query(options: LockQueryOptions = {}): Promise<LockEntry[]> {
    const state = await this.load();
    return state.entries.filter(entry => {
      if (options.kind && entry.kind !== options.kind) return false;
      if (options.name && entry.name.toLowerCase() !== options.name.toLowerCase()) return false;
      if (options.projectPath && entry.projectPath !== resolve(options.projectPath)) return false;
      if (options.agent && !entry.agents.includes(options.agent)) return false;
      if (options.scope && entry.scope !== options.scope) return false;
      if (options.action && entry.action !== options.action) return false;
      return true;
    });
  }

  async getCurrentState(options: LockQueryOptions = {}): Promise<LockEntry[]> {
    const entries = await this.query(options);
    const groups = new Map<string, LockEntry>();
    for (const entry of entries) {
      const key = this.getCurrentStateKey(entry);
      groups.set(key, entry);
    }
    return [...groups.values()].filter(e => e.action !== 'remove');
  }

  private getCurrentStateKey(entry: LockEntry): string {
    const agents = [...entry.agents].sort().join(',');
    return [
      entry.kind,
      entry.name.toLowerCase(),
      getEntryTargetKey(entry),
      entry.scope,
      agents,
      this.getLocationKey(entry),
    ].join(':');
  }

  private getLocationKey(entry: LockEntry): string {
    switch (entry.metadata.kind) {
      case 'skill':
        return entry.metadata.canonicalPath || entry.metadata.installPath;
      case 'mcp':
        return entry.metadata.configPath;
      case 'rules':
        return `${entry.metadata.configPath}:${entry.metadata.templateIds.join(',')}`;
    }
  }

  async getProjectPaths(): Promise<string[]> {
    const state = await this.load();
    return [...new Set(
      state.entries
        .filter(entry => entry.scope === 'project')
        .map(entry => entry.projectPath)
    )];
  }

  async findProjectsWithSkill(skillName: string): Promise<LockEntry[]> {
    return this.getCurrentState({ kind: 'skill', name: skillName });
  }

  async findStaleProjects(): Promise<string[]> {
    const projectPaths = await this.getProjectPaths();
    const stale: string[] = [];
    for (const projectPath of projectPaths) {
      if (!(await fileExists(projectPath))) {
        stale.push(projectPath);
      }
    }
    return stale;
  }

  async pruneStaleEntries(): Promise<LockPruneResult> {
    const stale = await this.findStaleProjects();
    let entriesRemoved = 0;

    if (stale.length === 0) {
      return { prunedProjects: [], entriesRemoved: 0 };
    }

    const state = await this.load();
    const staleSet = new Set(stale);
    const before = state.entries.length;
    state.entries = state.entries.filter(e => !staleSet.has(e.projectPath));
    entriesRemoved = before - state.entries.length;

    if (entriesRemoved > 0) {
      await this.save();
    }

    return { prunedProjects: stale, entriesRemoved };
  }

  async checkDrift(entry: LockEntry): Promise<LockDriftResult> {
    if (!entry.contentHash) {
      return { entry, status: 'match' };
    }

    if (entry.metadata.kind !== 'skill') {
      return { entry, status: 'match' };
    }

    const installPath = entry.metadata.installPath;
    if (!(await fileExists(installPath))) {
      return { entry, status: 'missing' };
    }

    const currentHash = await hashDirectory(installPath);
    if (!currentHash) {
      return { entry, status: 'missing' };
    }

    return {
      entry,
      status: currentHash === entry.contentHash ? 'match' : 'drift',
      currentHash,
    };
  }
}
