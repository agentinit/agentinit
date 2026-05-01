import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function getOwnPackageVersion(fallback = '0.0.0'): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, '../package.json'),
    resolve(moduleDir, '../../package.json'),
    resolve(process.cwd(), 'package.json'),
  ];

  for (const packageJsonPath of candidates) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown; version?: unknown };
      if (packageJson.name === 'agentinit' && typeof packageJson.version === 'string') {
        return packageJson.version;
      }
    } catch {
      // Try the next likely package root.
    }
  }

  return fallback;
}
