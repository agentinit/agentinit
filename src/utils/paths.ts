import { resolve, join } from 'path';
import { homedir } from 'os';

/**
 * Cross-platform path utilities for global configuration handling
 */

/**
 * Get the user's home directory
 */
export function getHomeDirectory(): string {
  return homedir();
}

/**
 * Get the current platform identifier
 */
export function getPlatform(): 'windows' | 'darwin' | 'linux' {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'darwin';
    case 'linux':
      return 'linux';
    default:
      // Default to linux for unknown platforms
      return 'linux';
  }
}

/**
 * Expand tilde (~) in a path to the home directory
 */
export function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return join(getHomeDirectory(), path.slice(2));
  }
  if (path === '~') {
    return getHomeDirectory();
  }
  return path;
}

/**
 * Get platform-specific environment variable values
 */
export function getEnvironmentPath(key: string): string | undefined {
  return process.env[key];
}

/**
 * Get the appropriate global config path for the current platform
 * @param globalConfigPath Single global config path (cross-platform)
 * @param globalConfigPaths Platform-specific config paths
 * @returns Resolved global config path or null if not supported
 */
export function resolveGlobalConfigPath(
  globalConfigPath?: string,
  globalConfigPaths?: {
    windows?: string;
    darwin?: string;
    linux?: string;
  }
): string | null {
  // If single path provided, use it for all platforms
  if (globalConfigPath) {
    return expandTilde(globalConfigPath);
  }

  // Use platform-specific path
  if (globalConfigPaths) {
    const platform = getPlatform();
    const platformPath = globalConfigPaths[platform];
    
    if (platformPath) {
      return expandTilde(platformPath);
    }
  }

  return null;
}

/**
 * Get Windows AppData paths
 */
export function getWindowsAppDataPaths() {
  return {
    roaming: getEnvironmentPath('APPDATA'), // %APPDATA%
    local: getEnvironmentPath('LOCALAPPDATA'), // %LOCALAPPDATA%
    userProfile: getEnvironmentPath('USERPROFILE') // %USERPROFILE%
  };
}

/**
 * Get macOS application support directory
 */
export function getMacOSApplicationSupportPath(): string {
  return join(getHomeDirectory(), 'Library', 'Application Support');
}

/**
 * Get Linux config directory (XDG Base Directory)
 */
export function getLinuxConfigPath(): string {
  const xdgConfigHome = getEnvironmentPath('XDG_CONFIG_HOME');
  if (xdgConfigHome) {
    return xdgConfigHome;
  }
  return join(getHomeDirectory(), '.config');
}

/**
 * Common global config path patterns for different agents
 */
export const GLOBAL_CONFIG_PATTERNS = {
  // Claude patterns
  claude: {
    code: '~/.mcp.json',
    desktop: {
      windows: '%APPDATA%/Claude/claude_desktop_config.json',
      darwin: '~/Library/Application Support/Claude/claude_desktop_config.json',
      linux: '~/.config/Claude/claude_desktop_config.json'
    }
  },
  
  // Cursor patterns
  cursor: '~/.cursor/mcp.json',
  
  // Codex CLI patterns  
  codex: '~/.codex/config.toml',
  
  // Gemini CLI patterns
  gemini: '~/.gemini/settings.json'
} as const;

/**
 * Resolve environment variables in a path
 * Currently supports %APPDATA%, %LOCALAPPDATA%, %USERPROFILE%
 */
export function resolveEnvironmentVariables(path: string): string {
  if (getPlatform() === 'windows') {
    const appDataPaths = getWindowsAppDataPaths();
    
    return path
      .replace(/%APPDATA%/g, appDataPaths.roaming || '')
      .replace(/%LOCALAPPDATA%/g, appDataPaths.local || '')
      .replace(/%USERPROFILE%/g, appDataPaths.userProfile || '');
  }
  
  return path;
}

/**
 * Get a fully resolved global config path
 * Handles tildes, environment variables, and platform-specific paths
 */
export function getFullGlobalConfigPath(
  globalConfigPath?: string,
  globalConfigPaths?: {
    windows?: string;
    darwin?: string;
    linux?: string;
  }
): string | null {
  const path = resolveGlobalConfigPath(globalConfigPath, globalConfigPaths);
  
  if (!path) {
    return null;
  }
  
  // Resolve environment variables and return absolute path
  const resolvedPath = resolveEnvironmentVariables(path);
  return resolve(resolvedPath);
}