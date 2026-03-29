import { promises as fs } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileExists } from '../utils/fs.js';

export type ManagedEntryKind = 'file' | 'directory';
export type ManagedEntrySource = 'sync' | 'skills';

export interface ManagedEntry {
  path: string;
  kind: ManagedEntryKind;
  source: ManagedEntrySource;
  existedBefore: boolean;
  backupPath?: string;
  backupLinkTarget?: string;
  ignorePath?: string;
}

interface ManagedState {
  version: 1;
  entries: ManagedEntry[];
}

interface RevertOptions {
  dryRun?: boolean;
  keepBackups?: boolean;
}

export interface RevertSummary {
  restored: number;
  removed: number;
  backupsRemoved: number;
}

const MANAGED_STATE_FILE = 'managed-state.json';
const BACKUPS_DIR = 'backups';

type FilesystemEntryKind = ManagedEntryKind | 'symlink';

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

async function pathType(targetPath: string): Promise<FilesystemEntryKind | null> {
  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      return 'symlink';
    }
    return stat.isDirectory() ? 'directory' : 'file';
  } catch {
    return null;
  }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const target = await fs.readlink(srcPath);
      await fs.mkdir(dirname(destPath), { recursive: true });
      await fs.symlink(target, destPath);
    } else {
      await fs.mkdir(dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function copyPath(src: string, dest: string): Promise<void> {
  const type = await pathType(src);
  if (!type) {
    return;
  }

  await fs.mkdir(dirname(dest), { recursive: true });

  if (type === 'symlink') {
    const target = await fs.readlink(src);
    await fs.symlink(target, dest);
  } else if (type === 'directory') {
    await copyDirectory(src, dest);
  } else {
    await fs.copyFile(src, dest);
  }
}

export class ManagedStateStore {
  private constructor(
    private readonly projectPath: string,
    private readonly state: ManagedState
  ) {}

  static async open(projectPath: string): Promise<ManagedStateStore> {
    const agentInitDir = join(projectPath, '.agentinit');
    const statePath = join(agentInitDir, MANAGED_STATE_FILE);
    const emptyState: ManagedState = { version: 1, entries: [] };

    try {
      const raw = await fs.readFile(statePath, 'utf8');
      const parsed = JSON.parse(raw) as ManagedState;

      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
        return new ManagedStateStore(projectPath, emptyState);
      }

      return new ManagedStateStore(projectPath, parsed);
    } catch {
      return new ManagedStateStore(projectPath, emptyState);
    }
  }

  private get agentInitDir(): string {
    return join(this.projectPath, '.agentinit');
  }

  private get stateFilePath(): string {
    return join(this.agentInitDir, MANAGED_STATE_FILE);
  }

  private get backupsDir(): string {
    return join(this.agentInitDir, BACKUPS_DIR);
  }

  private normalizeRelativePath(targetPath: string, preserveTrailingSlash: boolean = false): string {
    const hasTrailingSlash = preserveTrailingSlash && /[\\/]$/.test(targetPath);
    const relativePath = relative(this.projectPath, resolve(targetPath));
    const normalizedPath = toPosixPath(relativePath);

    if (hasTrailingSlash && normalizedPath) {
      return normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;
    }

    return normalizedPath;
  }

  private getEntry(targetPath: string): ManagedEntry | undefined {
    const relativePath = this.normalizeRelativePath(targetPath);
    return this.state.entries.find(entry => entry.path === relativePath);
  }

  private async createBackup(targetPath: string): Promise<{
    backupPath?: string;
    backupLinkTarget?: string;
  }> {
    const type = await pathType(targetPath);
    if (!type) {
      return {};
    }

    if (type === 'symlink') {
      try {
        const backupLinkTarget = await fs.readlink(targetPath);
        return { backupLinkTarget };
      } catch {
        return {};
      }
    }

    const relativeTargetPath = this.normalizeRelativePath(targetPath);
    const backupPath = join(this.backupsDir, relativeTargetPath);

    if (!(await fileExists(backupPath))) {
      await copyPath(targetPath, backupPath);
    }

    return { backupPath: this.normalizeRelativePath(backupPath) };
  }

  async trackGeneratedPath(
    targetPath: string,
    options: {
      kind: ManagedEntryKind;
      source: ManagedEntrySource;
      ignorePath?: string;
    }
  ): Promise<ManagedEntry> {
    const existing = this.getEntry(targetPath);
    if (existing) {
      if (options.ignorePath && !existing.ignorePath) {
        existing.ignorePath = this.normalizeRelativePath(options.ignorePath);
      }
      return existing;
    }

    const existedBefore = await fileExists(targetPath);
    const backup = existedBefore ? await this.createBackup(targetPath) : {};

    const entry: ManagedEntry = {
      path: this.normalizeRelativePath(targetPath),
      kind: options.kind,
      source: options.source,
      existedBefore,
      ...(backup.backupPath ? { backupPath: backup.backupPath } : {}),
      ...(backup.backupLinkTarget ? { backupLinkTarget: backup.backupLinkTarget } : {}),
      ...(options.ignorePath ? { ignorePath: this.normalizeRelativePath(options.ignorePath, true) } : {}),
    };

    this.state.entries.push(entry);
    return entry;
  }

  getEntries(): ManagedEntry[] {
    return [...this.state.entries];
  }

  getIgnorePaths(): string[] {
    if (this.state.entries.length === 0) {
      return [];
    }

    const paths = new Set<string>([
      '.agentinit/managed-state.json',
      '.agentinit/backups/',
    ]);

    for (const entry of this.state.entries) {
      if (entry.ignorePath) {
        paths.add(entry.ignorePath);
      }
    }

    return [...paths];
  }

  async save(): Promise<void> {
    await fs.mkdir(this.agentInitDir, { recursive: true });
    await fs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  async revertAll(options: RevertOptions = {}): Promise<RevertSummary> {
    const summary: RevertSummary = {
      restored: 0,
      removed: 0,
      backupsRemoved: 0,
    };

    const entries = [...this.state.entries].sort((a, b) => b.path.length - a.path.length);

    for (const entry of entries) {
      const absolutePath = resolve(this.projectPath, entry.path);
      const backupPath = entry.backupPath ? resolve(this.projectPath, entry.backupPath) : null;
      const backupLinkTarget = entry.backupLinkTarget;

      if (entry.existedBefore && backupLinkTarget !== undefined) {
        if (!options.dryRun) {
          await fs.rm(absolutePath, { recursive: true, force: true }).catch(() => {});
          await fs.mkdir(dirname(absolutePath), { recursive: true });
          await fs.symlink(backupLinkTarget, absolutePath);
        }
        summary.restored++;
      } else if (entry.existedBefore && backupPath && (await fileExists(backupPath))) {
        if (!options.dryRun) {
          await fs.rm(absolutePath, { recursive: true, force: true }).catch(() => {});
          await copyPath(backupPath, absolutePath);
        }
        summary.restored++;
      } else {
        if (!options.dryRun) {
          await fs.rm(absolutePath, { recursive: true, force: true }).catch(() => {});
        }
        summary.removed++;
      }

      if (!options.keepBackups && backupPath && (await fileExists(backupPath))) {
        if (!options.dryRun) {
          await fs.rm(backupPath, { recursive: true, force: true }).catch(() => {});
        }
        summary.backupsRemoved++;
      }
    }

    if (!options.dryRun) {
      this.state.entries.length = 0;
      await fs.rm(this.stateFilePath, { force: true }).catch(() => {});

      if (!options.keepBackups) {
        await fs.rm(this.backupsDir, { recursive: true, force: true }).catch(() => {});
      }

      try {
        const remainingEntries = await fs.readdir(this.agentInitDir);
        if (remainingEntries.length === 0) {
          await fs.rm(this.agentInitDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors when the directory does not exist.
      }
    }

    return summary;
  }
}
