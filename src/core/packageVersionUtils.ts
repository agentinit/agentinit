import { MCPServerType } from '../types/index.js';
import type { MCPServerConfig } from '../types/index.js';

export interface PackageInfo {
  name: string;
  version?: string | undefined;
}

/**
 * Helper function to match JavaScript package managers (npx/bunx) with shared regex patterns
 */
function matchJsManager(fullCommand: string, manager: 'npx' | 'bunx'): PackageInfo | null {
  // Pattern 0: manager -p package@version (preinstall pattern)
  const preinstallMatch = fullCommand.match(new RegExp(`${manager}\\s+(?:-[ygc]\\s+)?(?:--\\S+\\s+)*-p\\s+([^\\s]+)`));
  if (preinstallMatch?.[1]) {
    const spec = preinstallMatch[1];
    const versionSeparator = spec.lastIndexOf('@');
    if (versionSeparator > 0) {
      return {
        name: spec.slice(0, versionSeparator),
        version: spec.slice(versionSeparator + 1) || undefined,
      };
    }
    return { name: spec };
  }

  // Pattern 1: manager package-name@version
  const versionMatch = fullCommand.match(new RegExp(`${manager}\\s+(?:-[ygc]\\s+)?(?:--\\S+\\s+)*([^@\\s]+)@([^\\s]+)`));
  if (versionMatch && versionMatch[1] && versionMatch[2]) {
    return { name: versionMatch[1], version: versionMatch[2] };
  }

  // Pattern 2: manager -y @scope/package@latest or manager @scope/package@latest
  const scopedMatch = fullCommand.match(new RegExp(`${manager}\\s+(?:-[ygc]\\s+)?(?:--\\S+\\s+)*(@[^/]+\\/[^@\\s]+)(?:@([^\\s]+))?`));
  if (scopedMatch && scopedMatch[1]) {
    return { name: scopedMatch[1], version: scopedMatch[2] || undefined };
  }

  // Pattern 3: manager package-name (without version)
  const packageMatch = fullCommand.match(new RegExp(`${manager}\\s+(?:-[ygc]\\s+)?(?:--\\S+\\s+)*([^@\\s]+)`));
  if (packageMatch && packageMatch[1]) {
    return { name: packageMatch[1] };
  }

  return null;
}

/**
 * Parse a command string to extract package information for npx/bunx/pipx/uvx commands
 */
export function parsePackageFromCommand(command: string, args: string[] = []): PackageInfo | null {
  const fullCommand = [command, ...args].join(' ');

  // Try npx patterns
  const npxResult = matchJsManager(fullCommand, 'npx');
  if (npxResult) {
    return npxResult;
  }

  // Try bunx patterns
  const bunxResult = matchJsManager(fullCommand, 'bunx');
  if (bunxResult) {
    return bunxResult;
  }

  // Pattern 7: pipx run --spec package==version binary (with optional global flags)
  const pipxSpecMatch = fullCommand.match(/pipx\s+(?:(?:--\w+(?:\s+[^\s-]+)?|-\w+)\s+)*run\s+--spec\s+([^=\s]+)==([^\s]+)/);
  if (pipxSpecMatch && pipxSpecMatch[1] && pipxSpecMatch[2]) {
    return { name: pipxSpecMatch[1], version: pipxSpecMatch[2] };
  }

  // Pattern 8: pipx run package-name (without version, with optional global flags)
  const pipxMatch = fullCommand.match(/pipx\s+(?:(?:--\w+(?:\s+[^\s-]+)?|-\w+)\s+)*run\s+(?:--python\s+[^\s]+\s+)?([^@\s]+)/);
  if (pipxMatch && pipxMatch[1]) {
    return { name: pipxMatch[1] };
  }

  // Pattern 9: uvx package-name or uvx --from git+... package-name
  const uvxMatch = fullCommand.match(/uvx\s+(?:(?:--\w+(?:\s+[^\s-]+)?|-\w+)\s+)*([^@\s-][^@\s]*)/);
  if (uvxMatch && uvxMatch[1]) {
    return { name: uvxMatch[1] };
  }

  return null;
}

/**
 * Fetch package version from npm registry
 */
export async function fetchPackageVersionFromNpm(packageName: string, timeoutMs = 5000): Promise<string | null> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data['dist-tags']?.latest || data.version || null;
  } catch (error) {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Fetch package version from PyPI registry
 */
export async function fetchPackageVersionFromPyPI(packageName: string, timeoutMs = 5000): Promise<string | null> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.info?.version || null;
  } catch (error) {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Determine if package should use PyPI or npm registry
 */
export function isPythonPackageManager(command: string, _args: string[] = []): boolean {
  const firstToken = String(command || '').trim().split(/\s+/)[0];
  return firstToken === 'pipx' || firstToken === 'uvx';
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

  // If we already have a version from the command, validate it based on package manager type
  if (packageInfo.version) {
    const usePyPI = isPythonPackageManager(server.command, server.args);

    if (usePyPI) {
      // For Python packages, accept any version unless it's a known dist tag
      const distTags = ['latest', 'next', 'beta', 'alpha', 'rc', 'dev', 'canary'];
      if (!distTags.includes(packageInfo.version.toLowerCase())) {
        return packageInfo.version; // Return PEP440 versions unchanged
      }
      // For dist tags, fall through to registry lookup
    } else {
      // For JavaScript packages, check if it's a valid semver (including pre-release and build metadata)
      const isSemver = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(packageInfo.version);
      if (isSemver) {
        return packageInfo.version;
      }
      // For non-semver tags like 'next', 'beta', fall through to registry lookup
    }
  }

  // Determine which registry to use based on package manager
  const usePyPI = isPythonPackageManager(server.command, server.args);
  const latestVersion = usePyPI
    ? await fetchPackageVersionFromPyPI(packageInfo.name)
    : await fetchPackageVersionFromNpm(packageInfo.name);

  return latestVersion || "unknown";
}