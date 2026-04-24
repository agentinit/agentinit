import type { LockSource } from '../types/lockfile.js';

export interface LockSourceSpecifier {
  source: string;
  from?: string;
}

export function lockSourceToSpecifier(source: LockSource): LockSourceSpecifier | null {
  if (source.type === 'marketplace' && source.marketplace && source.pluginName) {
    return { source: source.pluginName, from: source.marketplace };
  }

  if (source.type === 'github') {
    if (source.owner && source.repo) {
      return {
        source: source.subpath
          ? `${source.owner}/${source.repo}/${source.subpath}`
          : `${source.owner}/${source.repo}`,
      };
    }

    if (source.url) {
      return { source: source.url };
    }
  }

  if (source.type === 'gitlab') {
    if (source.owner && source.repo) {
      const prefix = `gitlab:${source.owner}/${source.repo}`;
      return { source: source.subpath ? `${prefix}//${source.subpath}` : prefix };
    }

    if (source.url) {
      return { source: source.url };
    }
  }

  if (source.type === 'bitbucket') {
    if (source.owner && source.repo) {
      const prefix = `bitbucket:${source.owner}/${source.repo}`;
      return { source: source.subpath ? `${prefix}/${source.subpath}` : prefix };
    }

    if (source.url) {
      return { source: source.url };
    }
  }

  if (source.type === 'local' && source.path) {
    return { source: source.path };
  }

  return null;
}

export function formatLockSource(source: LockSource): string {
  const specifier = lockSourceToSpecifier(source);
  if (!specifier) {
    return source.type;
  }

  return specifier.from ? `${specifier.from}/${specifier.source}` : specifier.source;
}
