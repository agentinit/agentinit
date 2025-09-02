import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
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

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
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