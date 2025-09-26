import { describe, it, expect } from 'vitest';
import { parsePackageFromCommand } from '../../src/core/packageVersionUtils.js';

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
  });
});