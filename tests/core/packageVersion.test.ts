import { describe, it, expect } from 'vitest';
import { parsePackageFromCommand, isPythonPackageManager } from '../../src/core/packageVersionUtils.js';

describe('Package Version Detection', () => {
  describe('parsePackageFromCommand', () => {
    it('should parse npx with explicit version', () => {
      const result = parsePackageFromCommand('npx', ['chrome-devtools-mcp@0.2.7']);
      expect(result).toEqual({ name: 'chrome-devtools-mcp', version: '0.2.7' });
    });

    it('should parse npx with @latest version', () => {
      const result = parsePackageFromCommand('npx', ['chrome-devtools-mcp@latest']);
      expect(result).toEqual({ name: 'chrome-devtools-mcp', version: 'latest' });
    });

    it('should parse npx with scoped package', () => {
      const result = parsePackageFromCommand('npx', ['-y', '@modelcontextprotocol/server-everything']);
      expect(result).toEqual({ name: '@modelcontextprotocol/server-everything' });
    });

    it('should parse npx with scoped package and version', () => {
      const result = parsePackageFromCommand('npx', ['-y', '@modelcontextprotocol/server-everything@1.0.0']);
      expect(result).toEqual({ name: '@modelcontextprotocol/server-everything', version: '1.0.0' });
    });

    it('should parse npx without flags', () => {
      const result = parsePackageFromCommand('npx', ['some-package']);
      expect(result).toEqual({ name: 'some-package' });
    });

    it('should parse uvx command', () => {
      const result = parsePackageFromCommand('uvx', ['some-python-package']);
      expect(result).toEqual({ name: 'some-python-package' });
    });

    it('should parse uvx with --from flag', () => {
      const result = parsePackageFromCommand('uvx', ['--from', 'git+https://github.com/user/repo.git', 'package-name']);
      expect(result).toEqual({ name: 'package-name' });
    });

    it('should return null for non-package commands', () => {
      const result = parsePackageFromCommand('node', ['dist/index.js']);
      expect(result).toBeNull();
    });

    it('should return null for python commands', () => {
      const result = parsePackageFromCommand('python', ['-m', 'some_module']);
      expect(result).toBeNull();
    });

    it('should handle complex npx commands with multiple flags', () => {
      const result = parsePackageFromCommand('npx', ['--yes', '--quiet', 'package-name@1.2.3']);
      expect(result).toEqual({ name: 'package-name', version: '1.2.3' });
    });

    it('should parse npx with -p flag for preinstall', () => {
      const result = parsePackageFromCommand('npx', ['-p', '@scope/cli@1.2.3', 'cli', 'serve']);
      expect(result).toEqual({ name: '@scope/cli', version: '1.2.3' });
    });

    it('should parse npx with -p flag without version', () => {
      const result = parsePackageFromCommand('npx', ['-p', 'some-package', 'binary']);
      expect(result).toEqual({ name: 'some-package' });
    });

    it('should parse npx with -p flag and other flags', () => {
      const result = parsePackageFromCommand('npx', ['-y', '--quiet', '-p', 'package@2.0.0', 'command']);
      expect(result).toEqual({ name: 'package', version: '2.0.0' });
    });

    // Bunx tests (should work identically to npx)
    it('should parse bunx with explicit version', () => {
      const result = parsePackageFromCommand('bunx', ['chrome-devtools-mcp@0.2.7']);
      expect(result).toEqual({ name: 'chrome-devtools-mcp', version: '0.2.7' });
    });

    it('should parse bunx with scoped package', () => {
      const result = parsePackageFromCommand('bunx', ['-y', '@modelcontextprotocol/server-everything']);
      expect(result).toEqual({ name: '@modelcontextprotocol/server-everything' });
    });

    it('should parse bunx with scoped package and version', () => {
      const result = parsePackageFromCommand('bunx', ['-y', '@modelcontextprotocol/server-everything@1.0.0']);
      expect(result).toEqual({ name: '@modelcontextprotocol/server-everything', version: '1.0.0' });
    });

    it('should parse bunx without flags', () => {
      const result = parsePackageFromCommand('bunx', ['some-package']);
      expect(result).toEqual({ name: 'some-package' });
    });

    it('should parse bunx with -p flag for preinstall', () => {
      const result = parsePackageFromCommand('bunx', ['-p', '@scope/cli@1.2.3', 'cli', 'serve']);
      expect(result).toEqual({ name: '@scope/cli', version: '1.2.3' });
    });

    it('should parse bunx with -p flag without version', () => {
      const result = parsePackageFromCommand('bunx', ['-p', 'some-package', 'binary']);
      expect(result).toEqual({ name: 'some-package' });
    });

    // Pipx tests
    it('should parse pipx run with package name', () => {
      const result = parsePackageFromCommand('pipx', ['run', 'poetry']);
      expect(result).toEqual({ name: 'poetry' });
    });

    it('should parse pipx run with --spec flag', () => {
      const result = parsePackageFromCommand('pipx', ['run', '--spec', 'poetry==1.7.1', 'poetry']);
      expect(result).toEqual({ name: 'poetry', version: '1.7.1' });
    });

    it('should parse pipx run with --python flag', () => {
      const result = parsePackageFromCommand('pipx', ['run', '--python', 'python3.12', 'black']);
      expect(result).toEqual({ name: 'black' });
    });

    it('should parse pipx with global flags before run', () => {
      const result = parsePackageFromCommand('pipx', ['--python', 'python3.11', 'run', 'openai-mcp']);
      expect(result).toEqual({ name: 'openai-mcp' });
    });

    it('should parse pipx with multiple global flags before run', () => {
      const result = parsePackageFromCommand('pipx', ['--quiet', '--python', 'python3.11', 'run', 'poetry']);
      expect(result).toEqual({ name: 'poetry' });
    });

    it('should parse pipx with global flags and --spec', () => {
      const result = parsePackageFromCommand('pipx', ['--verbose', 'run', '--spec', 'black==23.1.0', 'black']);
      expect(result).toEqual({ name: 'black', version: '23.1.0' });
    });

    // UVX tests with additional flags
    it('should parse uvx with multiple flags', () => {
      const result = parsePackageFromCommand('uvx', ['-q', '--isolated', '--from', 'https://github.com/user/repo.git', 'package-name']);
      expect(result).toEqual({ name: 'package-name' });
    });

    it('should parse uvx with short flags', () => {
      const result = parsePackageFromCommand('uvx', ['-v', '--python', '3.11', 'my-package']);
      expect(result).toEqual({ name: 'my-package' });
    });
  });

  describe('isPythonPackageManager', () => {
    it('should return true for pipx command', () => {
      const result = isPythonPackageManager('pipx');
      expect(result).toBe(true);
    });

    it('should return true for uvx command', () => {
      const result = isPythonPackageManager('uvx');
      expect(result).toBe(true);
    });

    it('should return false for npx command', () => {
      const result = isPythonPackageManager('npx');
      expect(result).toBe(false);
    });

    it('should return false when uvx appears in args but not as command', () => {
      const result = isPythonPackageManager('node', ['script.js', 'uvx']);
      expect(result).toBe(false);
    });

    it('should return false when pipx appears in args but not as command', () => {
      const result = isPythonPackageManager('npm', ['install', 'pipx']);
      expect(result).toBe(false);
    });

    it('should handle command with spaces correctly', () => {
      const result = isPythonPackageManager('  pipx  ');
      expect(result).toBe(true);
    });
  });
});