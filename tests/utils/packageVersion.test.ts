import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractExplicitVersion,
  extractPackageName,
  extractPackageFromCommand,
  fetchLatestVersion,
  clearVersionCache,
  getVersionCacheStats
} from '../../src/utils/packageVersion.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('Package Version Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVersionCache();
  });

  afterEach(() => {
    clearVersionCache();
  });

  describe('extractExplicitVersion', () => {
    it('should extract semantic version from package@version', () => {
      expect(extractExplicitVersion('chrome-devtools-mcp@0.7.0')).toBe('0.7.0');
      expect(extractExplicitVersion('package@1.2.3')).toBe('1.2.3');
    });

    it('should extract version from scoped packages', () => {
      expect(extractExplicitVersion('@modelcontextprotocol/server-everything@0.6.2')).toBe('0.6.2');
      expect(extractExplicitVersion('@org/package@2.1.0')).toBe('2.1.0');
    });

    it('should handle pre-release versions', () => {
      expect(extractExplicitVersion('package@1.0.0-beta.1')).toBe('1.0.0-beta.1');
      expect(extractExplicitVersion('package@2.3.1-alpha')).toBe('2.3.1-alpha');
    });

    it('should handle build metadata', () => {
      expect(extractExplicitVersion('package@1.0.0+20130313144700')).toBe('1.0.0+20130313144700');
      expect(extractExplicitVersion('package@1.0.0-beta+exp.sha.5114f85')).toBe('1.0.0-beta+exp.sha.5114f85');
    });

    it('should return null for @latest tag', () => {
      expect(extractExplicitVersion('package@latest')).toBeNull();
      expect(extractExplicitVersion('chrome-devtools-mcp@latest')).toBeNull();
    });

    it('should return null for other tag formats', () => {
      expect(extractExplicitVersion('package@next')).toBeNull();
      expect(extractExplicitVersion('package@canary')).toBeNull();
    });

    it('should return null for packages without versions', () => {
      expect(extractExplicitVersion('package')).toBeNull();
      expect(extractExplicitVersion('@org/package')).toBeNull();
    });

    it('should handle invalid version formats', () => {
      expect(extractExplicitVersion('package@invalid')).toBeNull();
      expect(extractExplicitVersion('package@1.2')).toBeNull();
      expect(extractExplicitVersion('package@v1.0.0')).toBeNull();
    });
  });

  describe('extractPackageName', () => {
    it('should strip semantic version from package name', () => {
      expect(extractPackageName('chrome-devtools-mcp@0.7.0')).toBe('chrome-devtools-mcp');
      expect(extractPackageName('package@1.2.3')).toBe('package');
    });

    it('should strip @latest tag', () => {
      expect(extractPackageName('chrome-devtools-mcp@latest')).toBe('chrome-devtools-mcp');
      expect(extractPackageName('@org/package@latest')).toBe('@org/package');
    });

    it('should strip @next tag', () => {
      expect(extractPackageName('package@next')).toBe('package');
    });

    it('should strip @canary tag', () => {
      expect(extractPackageName('package@canary')).toBe('package');
    });

    it('should handle scoped packages', () => {
      expect(extractPackageName('@modelcontextprotocol/server-everything@0.6.2')).toBe('@modelcontextprotocol/server-everything');
      expect(extractPackageName('@org/package@latest')).toBe('@org/package');
    });

    it('should return name as-is if no version', () => {
      expect(extractPackageName('package')).toBe('package');
      expect(extractPackageName('@org/package')).toBe('@org/package');
    });

    it('should handle pre-release versions', () => {
      expect(extractPackageName('package@1.0.0-beta.1')).toBe('package');
      expect(extractPackageName('package@2.0.0-alpha+build')).toBe('package');
    });
  });

  describe('extractPackageFromCommand', () => {
    it('should extract package from npx command', () => {
      expect(extractPackageFromCommand('npx', ['-y', 'chrome-devtools-mcp@latest'])).toBe('chrome-devtools-mcp@latest');
      expect(extractPackageFromCommand('npx', ['chrome-devtools-mcp'])).toBe('chrome-devtools-mcp');
    });

    it('should extract scoped packages from npx', () => {
      expect(extractPackageFromCommand('npx', ['-y', '@modelcontextprotocol/server-everything'])).toBe('@modelcontextprotocol/server-everything');
    });

    it('should extract from bunx command', () => {
      expect(extractPackageFromCommand('bunx', ['-y', 'chrome-devtools-mcp@latest'])).toBe('chrome-devtools-mcp@latest');
    });

    it('should extract from pnpm dlx', () => {
      expect(extractPackageFromCommand('pnpm', ['dlx', 'chrome-devtools-mcp'])).toBe('chrome-devtools-mcp');
    });

    it('should skip flags and find package', () => {
      expect(extractPackageFromCommand('npx', ['-y', '--no-install', 'package@1.0.0'])).toBe('package@1.0.0');
    });

    it('should return null for non-package-manager commands', () => {
      expect(extractPackageFromCommand('node', ['server.js'])).toBeNull();
      expect(extractPackageFromCommand('python', ['-m', 'mcp_server'])).toBeNull();
    });

    it('should return null when no package found', () => {
      expect(extractPackageFromCommand('npx', ['-y', '--version'])).toBeNull();
      expect(extractPackageFromCommand('npx', ['-h'])).toBeNull();
    });

    it('should return null for undefined command or args', () => {
      expect(extractPackageFromCommand(undefined, ['package'])).toBeNull();
      expect(extractPackageFromCommand('npx', undefined)).toBeNull();
      expect(extractPackageFromCommand(undefined, undefined)).toBeNull();
    });

    it('should handle empty args array', () => {
      expect(extractPackageFromCommand('npx', [])).toBeNull();
    });

    it('should find first valid package in args', () => {
      expect(extractPackageFromCommand('npx', ['-y', 'first-package', 'second-package'])).toBe('first-package');
    });
  });

  describe('fetchLatestVersion', () => {
    it('should return explicit version without making API call', async () => {
      const version = await fetchLatestVersion('package@1.2.3');

      expect(version).toBe('1.2.3');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should fetch version from npm registry for @latest tag', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.7.0' })
      } as Response);

      const version = await fetchLatestVersion('chrome-devtools-mcp@latest');

      expect(version).toBe('0.7.0');
      expect(fetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/chrome-devtools-mcp/latest',
        expect.objectContaining({
          headers: { Accept: 'application/json' }
        })
      );
    });

    it('should fetch version for package without version tag', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1.5.2' })
      } as Response);

      const version = await fetchLatestVersion('chrome-devtools-mcp');

      expect(version).toBe('1.5.2');
    });

    it('should handle scoped packages', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.6.2' })
      } as Response);

      const version = await fetchLatestVersion('@modelcontextprotocol/server-everything');

      expect(version).toBe('0.6.2');
      expect(fetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/@modelcontextprotocol/server-everything/latest',
        expect.any(Object)
      );
    });

    it('should return null on 404 response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response);

      const version = await fetchLatestVersion('non-existent-package');

      expect(version).toBeNull();
    });

    it('should return null on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const version = await fetchLatestVersion('package');

      expect(version).toBeNull();
    });

    it('should handle timeout', async () => {
      vi.mocked(fetch).mockImplementationOnce(() =>
        new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('Timeout');
            error.name = 'AbortError';
            reject(error);
          }, 100);
        })
      );

      const version = await fetchLatestVersion('package', { timeout: 50 });

      expect(version).toBeNull();
    });

    it('should return null when version field missing', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'package' })
      } as Response);

      const version = await fetchLatestVersion('package');

      expect(version).toBeNull();
    });

    it('should use cache for repeated requests', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      } as Response);

      // First call
      const version1 = await fetchLatestVersion('package');
      expect(version1).toBe('1.0.0');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const version2 = await fetchLatestVersion('package');
      expect(version2).toBe('1.0.0');
      expect(fetch).toHaveBeenCalledTimes(1); // No additional call
    });

    it('should bypass cache when useCache is false', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      } as Response);

      await fetchLatestVersion('package', { useCache: true });
      await fetchLatestVersion('package', { useCache: false });

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should strip @latest before caching', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '2.0.0' })
      } as Response);

      // First call with @latest
      await fetchLatestVersion('package@latest');

      vi.mocked(fetch).mockClear();

      // Second call without @latest - should use cache
      await fetchLatestVersion('package');

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('Cache Management', () => {
    it('should clear version cache', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      } as Response);

      // Populate cache
      await fetchLatestVersion('package');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Clear cache
      clearVersionCache();

      // Fetch again - should make API call
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      } as Response);

      await fetchLatestVersion('package');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should return cache statistics', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      } as Response);

      // Populate cache with multiple packages
      await fetchLatestVersion('package1');
      await fetchLatestVersion('package2');
      await fetchLatestVersion('package3');

      const stats = getVersionCacheStats();

      expect(stats.size).toBe(3);
      expect(stats.entries).toHaveLength(3);
      expect(stats.entries[0]).toHaveProperty('package');
      expect(stats.entries[0]).toHaveProperty('version');
      expect(stats.entries[0]).toHaveProperty('age');
      expect(stats.entries[0]?.age).toBeGreaterThanOrEqual(0);
    });

    it('should show correct cache entry details', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '2.5.0' })
      } as Response);

      await fetchLatestVersion('test-package');

      const stats = getVersionCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.entries[0]?.package).toBe('test-package');
      expect(stats.entries[0]?.version).toBe('2.5.0');
    });

    it('should return empty stats for empty cache', () => {
      const stats = getVersionCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.entries).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle package names with special characters', () => {
      expect(extractPackageName('my-package_name@1.0.0')).toBe('my-package_name');
      expect(extractPackageFromCommand('npx', ['my-package_name'])).toBe('my-package_name');
    });

    it('should handle very long package names', () => {
      const longName = 'a'.repeat(100);
      expect(extractPackageName(`${longName}@1.0.0`)).toBe(longName);
    });

    it('should handle case sensitivity in command detection', () => {
      // Commands should be case-sensitive (lowercase only)
      expect(extractPackageFromCommand('NPX', ['package'])).toBeNull();
      expect(extractPackageFromCommand('Npx', ['package'])).toBeNull();
    });
  });
});
