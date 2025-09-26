import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPServerType } from '../../src/types/index.js';
import { getPackageVersion } from '../../src/core/packageVersionUtils.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['test-package']
      };

      const version = await getPackageVersion(server);

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
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'bunx',
        args: ['-y', 'another-package']
      };

      const version = await getPackageVersion(server);

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
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['nonexistent-package']
      };

      const version = await getPackageVersion(server);
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
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'pipx',
        args: ['run', 'poetry']
      };

      const version = await getPackageVersion(server);

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
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'uvx',
        args: ['black']
      };

      const version = await getPackageVersion(server);

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
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'uvx',
        args: ['failing-package']
      };

      const version = await getPackageVersion(server);
      expect(version).toBe('unknown');
    });
  });

  describe('version extraction from commands', () => {
    it('should extract version directly from command without API calls', async () => {
      const server = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['test-package@4.5.6']
      };

      const version = await getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('4.5.6');
    });

    it('should extract version from pipx --spec commands', async () => {
      const server = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'pipx',
        args: ['run', '--spec', 'poetry==1.7.1', 'poetry']
      };

      const version = await getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('1.7.1');
    });

    it('should accept PEP440 versions for Python packages without API calls', async () => {
      const testCases = [
        { version: '0.6', description: 'short version' },
        { version: '1.2rc1', description: 'release candidate' },
        { version: '3.0.post1', description: 'post release' },
        { version: '2.1.dev3', description: 'dev release' },
        { version: '1.0a2', description: 'alpha release' },
        { version: '2.0b1', description: 'beta release' }
      ];

      for (const testCase of testCases) {
        const server = {
          name: 'test-server',
          type: MCPServerType.STDIO,
          command: 'pipx',
          args: ['run', '--spec', `poetry==${testCase.version}`, 'poetry']
        };

        const version = await getPackageVersion(server);

        expect(mockFetch).not.toHaveBeenCalled();
        expect(version).toBe(testCase.version);
      }
    });

    it('should query registry for Python dist tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          info: { version: '3.1.4' }
        })
      });

      const server = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'pipx',
        args: ['run', '--spec', 'poetry==latest', 'poetry']
      };

      const version = await getPackageVersion(server);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://pypi.org/pypi/poetry/json',
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        })
      );
      expect(version).toBe('3.1.4');
    });

    it('should accept enhanced semver versions for JavaScript packages without API calls', async () => {
      const testCases = [
        { version: '1.2.3-alpha.1', description: 'pre-release version' },
        { version: '2.0.0-beta.2+build.123', description: 'pre-release with build metadata' },
        { version: '1.0.0+20210101', description: 'version with build metadata' },
        { version: '3.1.4-rc.1', description: 'release candidate' }
      ];

      for (const testCase of testCases) {
        const server = {
          name: 'test-server',
          type: MCPServerType.STDIO,
          command: 'npx',
          args: [`test-package@${testCase.version}`]
        };

        const version = await getPackageVersion(server);

        expect(mockFetch).not.toHaveBeenCalled();
        expect(version).toBe(testCase.version);
      }
    });

    it('should extract version directly from npx -p commands without API calls', async () => {
      const server = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'npx',
        args: ['-p', '@scope/cli@2.1.0', 'cli', 'serve']
      };

      const version = await getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('2.1.0');
    });

    it('should extract version directly from bunx -p commands without API calls', async () => {
      const server = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'bunx',
        args: ['-y', '-p', 'test-package@3.0.0', 'test-binary']
      };

      const version = await getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('3.0.0');
    });

    it('should extract version from pipx with global flags', async () => {
      const server = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'pipx',
        args: ['--python', 'python3.11', 'run', '--spec', 'black==23.1.0', 'black']
      };

      const version = await getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('23.1.0');
    });
  });

  describe('non-package manager commands', () => {
    it('should return unknown for non-package-manager commands', async () => {
      const server = {
        name: 'test-server',
        type: MCPServerType.STDIO,
        command: 'python',
        args: ['-m', 'some_module']
      };

      const version = await getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('unknown');
    });

    it('should return unknown for non-STDIO servers', async () => {
      const server = {
        name: 'test-server',
        type: 'HTTP' as any,
        command: 'npx',
        args: ['test-package']
      };

      const version = await getPackageVersion(server);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(version).toBe('unknown');
    });
  });
});