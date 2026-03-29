import { promises as fs } from 'fs';
import { dirname, join } from 'path';

const START_MARKER = '# START AgentInit Generated Files';
const END_MARKER = '# END AgentInit Generated Files';

function normalizeIgnorePath(projectPath: string, value: string): string {
  const relative = value.startsWith(projectPath)
    ? value.slice(projectPath.length + 1)
    : value;

  const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) {
    return normalized;
  }

  return normalized.endsWith('/') ? `/${normalized}` : `/${normalized}`;
}

function updateManagedBlock(existingContent: string, entries: string[]): string {
  const lines = existingContent.split('\n');
  const nextLines: string[] = [];
  let inManagedBlock = false;
  let sawManagedBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === START_MARKER) {
      inManagedBlock = true;
      sawManagedBlock = true;
      nextLines.push(line);
      entries.forEach(entry => nextLines.push(entry));
      continue;
    }

    if (trimmed === END_MARKER && inManagedBlock) {
      inManagedBlock = false;
      nextLines.push(line);
      continue;
    }

    if (!inManagedBlock) {
      nextLines.push(line);
    }
  }

  if (!sawManagedBlock) {
    if (existingContent.trim() && !existingContent.endsWith('\n\n')) {
      nextLines.push('');
    }
    nextLines.push(START_MARKER);
    entries.forEach(entry => nextLines.push(entry));
    nextLines.push(END_MARKER);
  }

  let content = nextLines.join('\n');
  if (!content.endsWith('\n')) {
    content += '\n';
  }

  return content;
}

export async function updateManagedIgnoreFile(
  projectPath: string,
  paths: string[],
  options: { local?: boolean } = {}
): Promise<string> {
  const ignoreFile = options.local ? join('.git', 'info', 'exclude') : '.gitignore';
  const ignoreFilePath = join(projectPath, ignoreFile);
  if (options.local) {
    const gitDir = join(projectPath, '.git');
    try {
      const stat = await fs.stat(gitDir);
      if (!stat.isDirectory()) {
        throw new Error();
      }
    } catch {
      throw new Error('Cannot update .git/info/exclude because this project is not a Git repository');
    }
  }

  const normalizedPaths = [...new Set(paths
    .map(path => normalizeIgnorePath(projectPath, path))
    .filter(Boolean)
  )].sort();

  let existingContent = '';
  try {
    existingContent = await fs.readFile(ignoreFilePath, 'utf8');
  } catch {
    existingContent = '';
  }

  const updatedContent = updateManagedBlock(existingContent, normalizedPaths);
  await fs.mkdir(dirname(ignoreFilePath), { recursive: true });
  await fs.writeFile(ignoreFilePath, updatedContent, 'utf8');

  return ignoreFilePath;
}

export async function removeManagedIgnoreBlock(
  projectPath: string,
  options: { local?: boolean; dryRun?: boolean } = {}
): Promise<boolean> {
  const ignoreFile = options.local ? join('.git', 'info', 'exclude') : '.gitignore';
  const ignoreFilePath = join(projectPath, ignoreFile);

  let content: string;
  try {
    content = await fs.readFile(ignoreFilePath, 'utf8');
  } catch {
    return false;
  }

  const startIndex = content.indexOf(START_MARKER);
  const endIndex = content.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    return false;
  }

  if (options.dryRun) {
    return true;
  }

  const beforeBlock = content.slice(0, startIndex).replace(/\n*$/, '\n');
  const afterBlock = content.slice(endIndex + END_MARKER.length).replace(/^\n+/, '');
  let nextContent = `${beforeBlock}${afterBlock}`.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');

  if (nextContent.trim() === '') {
    await fs.rm(ignoreFilePath, { force: true }).catch(() => {});
  } else {
    if (!nextContent.endsWith('\n')) {
      nextContent += '\n';
    }
    await fs.writeFile(ignoreFilePath, nextContent, 'utf8');
  }

  return true;
}
