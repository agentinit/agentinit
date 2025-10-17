/**
 * Package Version Utilities
 *
 * Utilities for extracting package names and versions from command strings
 * and fetching version information from package registries (npm, PyPI).
 */

import { logger } from './logger.js';

/**
 * Cache for registry API responses to avoid repeated requests
 * Key: package name, Value: { version: string, timestamp: number }
 */
const versionCache = new Map<string, { version: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extract explicit version from a package specifier
 *
 * @param packageSpec - Package specification (e.g., "chrome-devtools-mcp@0.7.0")
 * @returns Version string or null if not found
 *
 * @example
 * ```typescript
 * extractExplicitVersion("chrome-devtools-mcp@0.7.0")  // "0.7.0"
 * extractExplicitVersion("@org/package@1.2.3")         // "1.2.3"
 * extractExplicitVersion("package@latest")             // null (not explicit)
 * extractExplicitVersion("package")                    // null (no version)
 * ```
 */
export function extractExplicitVersion(packageSpec: string): string | null {
  // Match semantic version patterns: @1.2.3, @1.2.3-beta.1, etc.
  const versionMatch = packageSpec.match(/@([\d]+\.[\d]+\.[\d]+(?:[-+].+)?$)/);

  if (versionMatch && versionMatch[1]) {
    logger.debug(`[extractExplicitVersion] Found explicit version: ${versionMatch[1]} in "${packageSpec}"`);
    return versionMatch[1];
  }

  return null;
}

/**
 * Extract package name from a package specifier
 *
 * Strips version tags and handles scoped packages.
 *
 * @param packageSpec - Package specification with or without version
 * @returns Clean package name
 *
 * @example
 * ```typescript
 * extractPackageName("chrome-devtools-mcp@latest")         // "chrome-devtools-mcp"
 * extractPackageName("@modelcontextprotocol/server@1.0.0") // "@modelcontextprotocol/server"
 * extractPackageName("package")                            // "package"
 * ```
 */
export function extractPackageName(packageSpec: string): string {
  // Remove version specifiers (@1.2.3, @latest, @next, etc.)
  return packageSpec
    .replace(/@[\d]+\.[\d]+\.[\d]+(?:[-+].+)?$/, '')  // Remove semantic versions
    .replace(/@latest$/, '')                            // Remove @latest
    .replace(/@next$/, '')                              // Remove @next
    .replace(/@canary$/, '');                           // Remove @canary
}

/**
 * Extract package information from a command and its arguments
 *
 * Handles various package managers and command formats:
 * - npx, bunx, pnpm dlx
 * - With or without -y flag
 * - Scoped and unscoped packages
 * - Version specifiers (@version, @latest)
 *
 * @param command - Command being executed (e.g., "npx", "bunx")
 * @param args - Command arguments array
 * @returns Package name/specifier or null if not found
 *
 * @example
 * ```typescript
 * extractPackageFromCommand("npx", ["-y", "chrome-devtools-mcp@latest"])
 * // "chrome-devtools-mcp@latest"
 *
 * extractPackageFromCommand("bunx", ["@modelcontextprotocol/server-everything"])
 * // "@modelcontextprotocol/server-everything"
 * ```
 */
export function extractPackageFromCommand(
  command: string | undefined,
  args: string[] | undefined
): string | null {
  if (!command || !args || args.length === 0) {
    return null;
  }

  // Only handle package manager commands
  const packageManagers = ['npx', 'bunx', 'pnpm', 'yarn'];
  if (!packageManagers.includes(command)) {
    logger.debug(`[extractPackageFromCommand] Not a package manager command: ${command}`);
    return null;
  }

  // Skip flags and find the first package-like argument
  for (const arg of args) {
    // Skip flags
    if (arg.startsWith('-')) {
      continue;
    }

    // Skip special pnpm/yarn subcommands
    if (arg === 'dlx' || arg === 'exec') {
      continue;
    }

    // Check if looks like a package name
    // Scoped: @scope/package or @scope/package@version
    // Unscoped: package or package@version
    // Allow letters, numbers, hyphens, and underscores
    const packagePattern = /^(@[a-z0-9-]+\/)?[a-z0-9_-]+(@[\w.-]+)?$/i;

    if (packagePattern.test(arg)) {
      logger.debug(`[extractPackageFromCommand] Found package: ${arg}`);
      return arg;
    }
  }

  logger.debug(`[extractPackageFromCommand] No package found in args: ${args.join(' ')}`);
  return null;
}

/**
 * Fetch the latest version of an npm package from the registry
 *
 * Uses in-memory caching to avoid repeated API calls. Handles network
 * errors and invalid package names gracefully.
 *
 * @param packageSpec - Package name or specification
 * @param options - Fetch options
 * @param options.timeout - Request timeout in milliseconds (default: 5000)
 * @param options.useCache - Whether to use cached results (default: true)
 * @returns Version string or null if not found
 *
 * @example
 * ```typescript
 * const version = await fetchLatestVersion("chrome-devtools-mcp");
 * // "0.7.0"
 *
 * const version = await fetchLatestVersion("@modelcontextprotocol/server-everything");
 * // "0.6.2"
 * ```
 */
export async function fetchLatestVersion(
  packageSpec: string,
  options: { timeout?: number; useCache?: boolean } = {}
): Promise<string | null> {
  const { timeout = 5000, useCache = true } = options;

  // First, check for explicit version in the package spec
  const explicitVersion = extractExplicitVersion(packageSpec);
  if (explicitVersion) {
    return explicitVersion;
  }

  // Clean the package name (remove @latest, @next, etc.)
  const cleanPackageName = extractPackageName(packageSpec);

  // Check cache first
  if (useCache) {
    const cached = versionCache.get(cleanPackageName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger.debug(`[fetchLatestVersion] Cache hit for: ${cleanPackageName} -> ${cached.version}`);
      return cached.version;
    }
  }

  try {
    logger.debug(`[fetchLatestVersion] Fetching from npm registry: ${cleanPackageName}`);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const url = `https://registry.npmjs.org/${cleanPackageName}/latest`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.debug(`[fetchLatestVersion] npm registry returned ${response.status} for ${cleanPackageName}`);
      return null;
    }

    const data = await response.json() as { version?: string };

    if (!data.version) {
      logger.debug(`[fetchLatestVersion] No version field in response for ${cleanPackageName}`);
      return null;
    }

    // Cache the result
    versionCache.set(cleanPackageName, {
      version: data.version,
      timestamp: Date.now(),
    });

    logger.debug(`[fetchLatestVersion] Success: ${cleanPackageName}@${data.version}`);
    return data.version;

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        logger.debug(`[fetchLatestVersion] Timeout fetching version for ${cleanPackageName}`);
      } else {
        logger.debug(`[fetchLatestVersion] Error fetching version: ${error.message}`);
      }
    }
    return null;
  }
}

/**
 * Clear the version cache
 *
 * Useful for testing or when you want to force fresh registry lookups.
 */
export function clearVersionCache(): void {
  versionCache.clear();
  logger.debug('[clearVersionCache] Cache cleared');
}

/**
 * Get cache statistics
 *
 * @returns Object with cache size and entry details
 */
export function getVersionCacheStats(): { size: number; entries: Array<{ package: string; version: string; age: number }> } {
  const now = Date.now();
  const entries = Array.from(versionCache.entries()).map(([pkg, data]) => ({
    package: pkg,
    version: data.version,
    age: now - data.timestamp,
  }));

  return {
    size: versionCache.size,
    entries,
  };
}
