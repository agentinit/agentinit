import { MCPServerType } from '../types/index.js';
import type { MCPServerConfig } from '../types/index.js';

export interface PackageInfo {
  name: string;
  version?: string | undefined;
}

/**
 * Parse a command string to extract package information for npx/bunx/pipx/uvx commands
 */
export function parsePackageFromCommand(command: string, args: string[] = []): PackageInfo | null {
  const fullCommand = [command, ...args].join(' ');

  // Pattern 1: npx package-name@version
  const npxVersionMatch = fullCommand.match(/npx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*([^@\s]+)@([^\s]+)/);
  if (npxVersionMatch && npxVersionMatch[1] && npxVersionMatch[2]) {
    return { name: npxVersionMatch[1], version: npxVersionMatch[2] };
  }

  // Pattern 2: npx -y @scope/package@latest or npx @scope/package@latest
  const npxScopedMatch = fullCommand.match(/npx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*(@[^/]+\/[^@\s]+)(?:@([^\s]+))?/);
  if (npxScopedMatch && npxScopedMatch[1]) {
    return { name: npxScopedMatch[1], version: npxScopedMatch[2] || undefined };
  }

  // Pattern 3: npx package-name (without version)
  const npxMatch = fullCommand.match(/npx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*([^@\s]+)/);
  if (npxMatch && npxMatch[1]) {
    return { name: npxMatch[1] };
  }

  // Pattern 4: bunx package-name@version (same patterns as npx)
  const bunxVersionMatch = fullCommand.match(/bunx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*([^@\s]+)@([^\s]+)/);
  if (bunxVersionMatch && bunxVersionMatch[1] && bunxVersionMatch[2]) {
    return { name: bunxVersionMatch[1], version: bunxVersionMatch[2] };
  }

  // Pattern 5: bunx -y @scope/package@latest or bunx @scope/package@latest
  const bunxScopedMatch = fullCommand.match(/bunx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*(@[^/]+\/[^@\s]+)(?:@([^\s]+))?/);
  if (bunxScopedMatch && bunxScopedMatch[1]) {
    return { name: bunxScopedMatch[1], version: bunxScopedMatch[2] || undefined };
  }

  // Pattern 6: bunx package-name (without version)
  const bunxMatch = fullCommand.match(/bunx\s+(?:-[ygc]\s+)?(?:--\S+\s+)*([^@\s]+)/);
  if (bunxMatch && bunxMatch[1]) {
    return { name: bunxMatch[1] };
  }

  // Pattern 7: pipx run --spec package==version binary
  const pipxSpecMatch = fullCommand.match(/pipx\s+run\s+--spec\s+([^=\s]+)==([^\s]+)/);
  if (pipxSpecMatch && pipxSpecMatch[1] && pipxSpecMatch[2]) {
    return { name: pipxSpecMatch[1], version: pipxSpecMatch[2] };
  }

  // Pattern 8: pipx run package-name (without version)
  const pipxMatch = fullCommand.match(/pipx\s+run\s+(?:--python\s+[^\s]+\s+)?([^@\s]+)/);
  if (pipxMatch && pipxMatch[1]) {
    return { name: pipxMatch[1] };
  }

  // Pattern 9: uvx package-name or uvx --from git+... package-name
  const uvxMatch = fullCommand.match(/uvx\s+(?:--from\s+[^\s]+\s+)?([^@\s]+)/);
  if (uvxMatch && uvxMatch[1]) {
    return { name: uvxMatch[1] };
  }

  return null;
}

/**
 * Fetch package version from npm registry
 */
export async function fetchPackageVersionFromNpm(packageName: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data['dist-tags']?.latest || data.version || null;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch package version from PyPI registry
 */
export async function fetchPackageVersionFromPyPI(packageName: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.info?.version || null;
  } catch (error) {
    return null;
  }
}

/**
 * Determine if package should use PyPI or npm registry
 */
export function isPythonPackageManager(command: string, args: string[] = []): boolean {
  const fullCommand = [command, ...args].join(' ');
  return fullCommand.includes('pipx') || fullCommand.includes('uvx');
}

/**
 * Get package version for STDIO MCP servers that use npx/bunx/uvx/pipx
 *
 * This function works by:
 * 1. Parsing the command string to extract package names and versions
 * 2. If version is already specified in command (e.g. package@1.2.3), use it directly
 * 3. If no version specified, query the appropriate package registry:
 *    - npm registry for JavaScript packages (npx/bunx)
 *    - PyPI registry for Python packages (pipx/uvx)
 *
 * Note: This does NOT require the actual package manager tools (npx/bunx/pipx/uvx)
 * to be installed. It only parses command strings and makes HTTP requests to
 * public package registries. If network requests fail, it gracefully returns "unknown".
 */
export async function getPackageVersion(server: MCPServerConfig): Promise<string> {
  if (server.type !== MCPServerType.STDIO || !server.command) {
    return "unknown";
  }

  const packageInfo = parsePackageFromCommand(server.command, server.args);
  if (!packageInfo) {
    return "unknown";
  }

  // If we already have a version from the command, use it
  if (packageInfo.version && packageInfo.version !== 'latest') {
    return packageInfo.version;
  }

  // Determine which registry to use based on package manager
  const usePyPI = isPythonPackageManager(server.command, server.args);
  const latestVersion = usePyPI
    ? await fetchPackageVersionFromPyPI(packageInfo.name)
    : await fetchPackageVersionFromNpm(packageInfo.name);

  return latestVersion || "unknown";
}