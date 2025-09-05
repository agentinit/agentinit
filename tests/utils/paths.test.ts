import { 
  getHomeDirectory, 
  getPlatform, 
  expandTilde, 
  resolveGlobalConfigPath, 
  getFullGlobalConfigPath,
  resolveEnvironmentVariables
} from '../../src/utils/paths.js';
import { homedir } from 'os';

describe('paths utilities', () => {
  describe('getHomeDirectory', () => {
    it('should return the user home directory', () => {
      const home = getHomeDirectory();
      expect(home).toBe(homedir());
    });
  });

  describe('getPlatform', () => {
    it('should return correct platform identifiers', () => {
      const platform = getPlatform();
      expect(['windows', 'darwin', 'linux']).toContain(platform);
    });

    it('should map process.platform correctly', () => {
      // Mock process.platform for testing
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getPlatform()).toBe('windows');
      
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getPlatform()).toBe('darwin');
      
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getPlatform()).toBe('linux');
      
      Object.defineProperty(process, 'platform', { value: 'freebsd' });
      expect(getPlatform()).toBe('linux'); // Default fallback
      
      // Restore original
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });
  });

  describe('expandTilde', () => {
    const homeDir = getHomeDirectory();
    
    it('should expand ~ to home directory', () => {
      expect(expandTilde('~')).toBe(homeDir);
    });

    it('should expand ~/ to home directory with slash', () => {
      expect(expandTilde('~/Documents')).toBe(`${homeDir}/Documents`);
    });

    it('should not modify paths without tilde', () => {
      expect(expandTilde('/absolute/path')).toBe('/absolute/path');
      expect(expandTilde('relative/path')).toBe('relative/path');
    });

    it('should not expand tilde in the middle of path', () => {
      expect(expandTilde('/some/~/path')).toBe('/some/~/path');
    });
  });

  describe('resolveGlobalConfigPath', () => {
    it('should use single global config path when provided', () => {
      const result = resolveGlobalConfigPath('~/.config/test.json');
      expect(result).toBe(`${getHomeDirectory()}/.config/test.json`);
    });

    it('should use platform-specific path when available', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      const result = resolveGlobalConfigPath(undefined, {
        darwin: '~/Library/Test/config.json',
        linux: '~/.config/test.json',
        windows: '%APPDATA%/Test/config.json'
      });
      
      expect(result).toBe(`${getHomeDirectory()}/Library/Test/config.json`);
      
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should return null when no paths provided', () => {
      const result = resolveGlobalConfigPath();
      expect(result).toBeNull();
    });

    it('should return null when platform-specific path not found', () => {
      const result = resolveGlobalConfigPath(undefined, {
        windows: '%APPDATA%/Test/config.json'
      });
      
      // This will return null unless we're on Windows
      if (getPlatform() !== 'windows') {
        expect(result).toBeNull();
      }
    });

    it('should prioritize single path over platform-specific paths', () => {
      const result = resolveGlobalConfigPath('~/.priority.json', {
        darwin: '~/Library/Test/config.json',
        linux: '~/.config/test.json'
      });
      
      expect(result).toBe(`${getHomeDirectory()}/.priority.json`);
    });
  });

  describe('resolveEnvironmentVariables', () => {
    const originalEnv = process.env;
    
    beforeEach(() => {
      // Mock environment variables
      process.env = {
        ...originalEnv,
        APPDATA: 'C:\\Users\\Test\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
        USERPROFILE: 'C:\\Users\\Test'
      };
    });
    
    afterEach(() => {
      process.env = originalEnv;
    });

    it('should resolve Windows environment variables', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      expect(resolveEnvironmentVariables('%APPDATA%/Test/config.json'))
        .toBe('C:\\Users\\Test\\AppData\\Roaming/Test/config.json');
      
      expect(resolveEnvironmentVariables('%LOCALAPPDATA%/Test/config.json'))
        .toBe('C:\\Users\\Test\\AppData\\Local/Test/config.json');
      
      expect(resolveEnvironmentVariables('%USERPROFILE%/Test/config.json'))
        .toBe('C:\\Users\\Test/Test/config.json');
      
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should not resolve environment variables on non-Windows platforms', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      const path = '%APPDATA%/Test/config.json';
      expect(resolveEnvironmentVariables(path)).toBe(path);
      
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });
  });

  describe('getFullGlobalConfigPath', () => {
    const originalEnv = process.env;
    
    beforeEach(() => {
      process.env = {
        ...originalEnv,
        APPDATA: 'C:\\Users\\Test\\AppData\\Roaming'
      };
    });
    
    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return fully resolved absolute path', () => {
      const result = getFullGlobalConfigPath('~/.test/config.json');
      expect(result?.startsWith('/')).toBe(true); // Should be absolute
      expect(result).toContain('.test/config.json');
    });

    it('should handle Windows paths with environment variables', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const result = getFullGlobalConfigPath(undefined, {
        windows: '%APPDATA%/Test/config.json'
      });
      
      expect(result).toContain('AppData\\Roaming');
      expect(result).toContain('config.json');
      
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should return null when no valid path can be resolved', () => {
      const result = getFullGlobalConfigPath();
      expect(result).toBeNull();
    });
  });
});