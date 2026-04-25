import type { LockSource } from '../types/lockfile.js';

export interface LockSourceSpecifier {
  source: string;
  from?: string;
  prefix?: string;
}

export function lockSourceToSpecifier(source: LockSource): LockSourceSpecifier | null {
  if (source.type === 'marketplace' && source.marketplace && source.pluginName) {
    return {
      source: source.pluginName,
      from: source.marketplace,
      ...(source.prefix ? { prefix: source.prefix } : {}),
    };
  }

  if (source.type === 'github') {
    if (source.owner && source.repo) {
      return {
        source: source.subpath
          ? `${source.owner}/${source.repo}/${source.subpath}`
          : `${source.owner}/${source.repo}`,
        ...(source.prefix ? { prefix: source.prefix } : {}),
      };
    }

    if (source.url) {
      return { source: source.url, ...(source.prefix ? { prefix: source.prefix } : {}) };
    }
  }

  if (source.type === 'gitlab') {
    if (source.owner && source.repo) {
      const prefix = `gitlab:${source.owner}/${source.repo}`;
      return {
        source: source.subpath ? `${prefix}//${source.subpath}` : prefix,
        ...(source.prefix ? { prefix: source.prefix } : {}),
      };
    }

    if (source.url) {
      return { source: source.url, ...(source.prefix ? { prefix: source.prefix } : {}) };
    }
  }

  if (source.type === 'bitbucket') {
    if (source.owner && source.repo) {
      const prefix = `bitbucket:${source.owner}/${source.repo}`;
      return {
        source: source.subpath ? `${prefix}/${source.subpath}` : prefix,
        ...(source.prefix ? { prefix: source.prefix } : {}),
      };
    }

    if (source.url) {
      return { source: source.url, ...(source.prefix ? { prefix: source.prefix } : {}) };
    }
  }

  if (source.type === 'local' && source.path) {
    return { source: source.path, ...(source.prefix ? { prefix: source.prefix } : {}) };
  }

  return null;
}

export function formatLockSource(source: LockSource): string {
  const specifier = lockSourceToSpecifier(source);
  if (!specifier) {
    return source.type;
  }

  const formatted = specifier.from ? `${specifier.from}/${specifier.source}` : specifier.source;
  return specifier.prefix ? `${formatted} [prefix: ${specifier.prefix}]` : formatted;
}
