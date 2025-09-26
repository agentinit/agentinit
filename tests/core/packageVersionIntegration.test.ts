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