import { promises as fs } from 'fs';
import { platform } from 'os';
import { join, dirname, basename, resolve, relative } from 'path';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function pathExists(path: string, type: 'file' | 'folder'): Promise<boolean> {
  if (!(await fileExists(path))) {
    return false;
  }
  
  if (type === 'folder') {
    return await isDirectory(path);
  } else {
    return !(await isDirectory(path));
  }
}

export async function readFileIfExists(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

export async function writeFile(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path, content, 'utf8');
}

export async function copyFile(src: string, dest: string): Promise<void> {
  const dir = dirname(dest);
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(src, dest);
}

export async function listFiles(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await findFiles(fullPath, pattern);
        files.push(...subFiles);
      } else if (pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  
  return files;
}

export async function ensureAgentInitDir(projectPath: string): Promise<string> {
  const agentInitDir = join(projectPath, '.agentinit');
  await fs.mkdir(agentInitDir, { recursive: true });
  return agentInitDir;
}

export async function getAgentInitTomlPath(projectPath: string): Promise<string> {
  const agentInitDir = await ensureAgentInitDir(projectPath);
  return join(agentInitDir, 'agentinit.toml');
}

export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function readSymlinkTarget(path: string): Promise<string | null> {
  try {
    return await fs.readlink(path);
  } catch {
    return null;
  }
}

export async function resolveRealPathOrSelf(path: string): Promise<string> {
  const resolvedPath = resolve(path);
  try {
    return await fs.realpath(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

export async function resolveParentSymlinks(path: string): Promise<string> {
  const resolvedPath = resolve(path);
  const parentDir = dirname(resolvedPath);
  const baseName = basename(resolvedPath);

  try {
    const realParent = await fs.realpath(parentDir);
    return join(realParent, baseName);
  } catch {
    return resolvedPath;
  }
}

export async function pathsReferToSameLocation(left: string, right: string): Promise<boolean> {
  const [realLeft, realRight] = await Promise.all([
    resolveRealPathOrSelf(left),
    resolveRealPathOrSelf(right),
  ]);

  if (realLeft === realRight) {
    return true;
  }

  const [leftWithResolvedParents, rightWithResolvedParents] = await Promise.all([
    resolveParentSymlinks(left),
    resolveParentSymlinks(right),
  ]);

  return leftWithResolvedParents === rightWithResolvedParents;
}

export async function createRelativeSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const resolvedTarget = resolve(target);
    const resolvedLinkPath = resolve(linkPath);

    if (await pathsReferToSameLocation(resolvedTarget, resolvedLinkPath)) {
      return true;
    }

    try {
      const stats = await fs.lstat(resolvedLinkPath);
      if (stats.isSymbolicLink()) {
        const existingTarget = await fs.readlink(resolvedLinkPath);
        const resolvedExistingTarget = resolve(dirname(resolvedLinkPath), existingTarget);
        if (resolvedExistingTarget === resolvedTarget) {
          return true;
        }
        await fs.rm(resolvedLinkPath, { force: true });
      } else {
        await fs.rm(resolvedLinkPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ELOOP'
      ) {
        await fs.rm(resolvedLinkPath, { force: true }).catch(() => {});
      }
    }

    await fs.mkdir(dirname(resolvedLinkPath), { recursive: true });

    const realLinkDir = await resolveParentSymlinks(dirname(resolvedLinkPath));
    const realTarget = await resolveRealPathOrSelf(resolvedTarget);
    const relativeTarget = relative(realLinkDir, realTarget);
    const symlinkType = platform() === 'win32' ? 'junction' : undefined;

    await fs.symlink(relativeTarget, resolvedLinkPath, symlinkType);
    return true;
  } catch {
    return false;
  }
}
