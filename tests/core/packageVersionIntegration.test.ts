import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPServerType } from '../../src/types/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// We need to import the internal functions for testing
// Since they're not exported, we'll create a test wrapper
class PackageVersionTester {
  static parsePackageFromCommand(command: string, args: string[] = []): { name: string; version?: string | undefined } | null {
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

  static async fetchPackageVersionFromNpm(packageName: string, timeoutMs = 5000): Promise<string | null> {
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

  static async fetchPackageVersionFromPyPI(packageName: string, timeoutMs = 5000): Promise<string | null> {
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

  static isPythonPackageManager(command: string, args: string[] = []): boolean {
    const fullCommand = [command, ...args].join(' ');
    return fullCommand.includes('pipx') || fullCommand.includes('uvx');
  }

  static async getPackageVersion(server: { type: string; command?: string; args?: string[] }): Promise<string> {
    if (server.type !== MCPServerType.STDIO || !server.command) {
      return "unknown";
    }

    const packageInfo = this.parsePackageFromCommand(server.command, server.args);
    if (!packageInfo) {
      return "unknown";
    }

    // If we already have a version from the command, use it
    if (packageInfo.version && packageInfo.version !== 'latest') {
      return packageInfo.version;
    }

    // Determine which registry to use based on package manager
    const usePyPI = this.isPythonPackageManager(server.command, server.args);
    const latestVersion = usePyPI
      ? await this.fetchPackageVersionFromPyPI(packageInfo.name)
      : await this.fetchPackageVersionFromNpm(packageInfo.name);

    return latestVersion || "unknown";
  }
}

describe('Package Version Detection (Integration)', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('npm registry integration', () => {
    it('should fetch version from npm registry for npx commands', async () => {
      // Mock npm registry response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.2.3' }
        })
      });

      const server = {
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['test-package']
      };

      const version = await PackageVersionTester.getPackageVersion(server);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/test-package',
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        })
      );
      expect(version).toBe('1.2.3');
    });

    it('should fetch version from npm registry for bunx commands', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '2.0.0' }
        })
      });

      const server = {
        type: MCPServerType.STDIO,
        command: 'bunx',
        args: ['-y', 'another-package']
      };

      const version = await PackageVersionTester.getPackageVersion(server);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/another-package',
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        })
      );
      expect(version).toBe('2.0.0');
    });

    it('should handle npm registry errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const server = {
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['nonexistent-package']
      };

      const version = await PackageVersionTester.getPackageVersion(server);
      expect(version).toBe('unknown');
    });
  });

  describe('PyPI registry integration', () => {
    it('should fetch version from PyPI registry for pipx commands', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          info: { version: '3.1.4' }
        })
      });

      const server = {
        type: MCPServerType.STDIO,
        command: 'pipx',
        args: ['run', 'poetry']
      };

      const version = await PackageVersionTester.getPackageVersion(server);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://pypi.org/pypi/poetry/json',
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        })
      );
      expect(version).toBe('3.1.4');
    });

    it('should fetch version from PyPI registry for uvx commands', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          info: { version: '1.0.5' }
        })
      });

      const server = {
        type: MCPServerType.STDIO,
        command: 'uvx',
        args: ['black']
      };

      const version = await PackageVersionTester.getPackageVersion(server);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://pypi.org/pypi/black/json',
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        })
      );
      expect(version).toBe('1.0.5');
    });

    it('should handle PyPI registry errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const server = {
        type: MCPServerType.STDIO,
        command: 'uvx',
        args: ['failing-package']
      };

      const version = await PackageVersionTester.getPackageVersion(server);
      expect(version).toBe('unknown');
    });
  });

  describe('version extraction from commands', () => {
    it('should extract version directly from command without API calls', async () => {
      const server = {
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['test-package@4.5.6']
      };

      const version = await PackageVersionTester.getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('4.5.6');
    });

    it('should extract version from pipx --spec commands', async () => {
      const server = {
        type: MCPServerType.STDIO,
        command: 'pipx',
        args: ['run', '--spec', 'poetry==1.7.1', 'poetry']
      };

      const version = await PackageVersionTester.getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('1.7.1');
    });
  });

  describe('non-package manager commands', () => {
    it('should return unknown for non-package-manager commands', async () => {
      const server = {
        type: MCPServerType.STDIO,
        command: 'python',
        args: ['-m', 'some_module']
      };

      const version = await PackageVersionTester.getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('unknown');
    });

    it('should return unknown for non-STDIO servers', async () => {
      const server = {
        type: 'HTTP',
        command: 'npx',
        args: ['test-package']
      };

      const version = await PackageVersionTester.getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('unknown');
    });
  });
});