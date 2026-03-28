import type { SkillInfo } from './skills.js';
import type { MCPServerConfig } from './index.js';

/**
 * Supported plugin formats across different AI coding agents
 */
export type PluginFormat = 'claude' | 'cursor' | 'codex' | 'gemini' | 'generic';

/**
 * Format-agnostic normalized plugin representation.
 * All format-specific parsers produce this as output.
 */
export interface NormalizedPlugin {
  name: string;
  version: string;
  description: string;
  source: PluginSource;
  format: PluginFormat;
  skills: SkillInfo[];
  mcpServers: MCPServerConfig[];
  warnings: string[];
}

/**
 * Where a plugin came from
 */
export interface PluginSource {
  type: 'marketplace' | 'github' | 'local';
  marketplace?: string | undefined;
  url?: string | undefined;
  path?: string | undefined;
  owner?: string | undefined;
  repo?: string | undefined;
  pluginName?: string | undefined;
}

/**
 * A marketplace registry that can be searched for plugins
 */
export interface MarketplaceRegistry {
  id: string;
  name: string;
  repoUrl: string;
  pluginDirs: string[];
  cacheTtlMs: number;
}

/**
 * A plugin found in a marketplace
 */
export interface MarketplacePlugin {
  name: string;
  description: string;
  version: string;
  path: string;
  category: string;
  registry: string;
}

/**
 * Record of a plugin that has been installed
 */
export interface InstalledPlugin {
  name: string;
  version: string;
  description: string;
  source: PluginSource;
  format: string;
  installedAt: string;
  scope: 'project' | 'global';
  components: {
    skills: Array<{ name: string; agent: string; path: string }>;
    mcpServers: Array<{ name: string; agent: string }>;
  };
  warnings: string[];
}

/**
 * Persistent registry of installed plugins
 */
export interface PluginRegistry {
  version: 1;
  plugins: InstalledPlugin[];
}

/**
 * Options for the plugins install command
 */
export interface PluginInstallOptions {
  global?: boolean | undefined;
  agents?: string[] | undefined;
  from?: string | undefined;
  yes?: boolean | undefined;
  list?: boolean | undefined;
}

/**
 * Result of a plugin installation
 */
export interface PluginInstallResult {
  plugin: NormalizedPlugin;
  skills: {
    installed: Array<{ name: string; agent: string; path: string }>;
    skipped: Array<{ name: string; reason: string }>;
  };
  mcpServers: {
    applied: Array<{ name: string; agent: string }>;
    skipped: Array<{ name: string; reason: string }>;
  };
  warnings: string[];
}

/**
 * Raw Claude plugin manifest from .claude-plugin/plugin.json
 */
export interface ClaudePluginManifest {
  name: string;
  version?: string;
  description?: string;
  author?: { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  commands?: string | string[];
  agents?: string | string[];
  hooks?: string;
  mcpServers?: string;
}

/**
 * Raw Cursor plugin manifest from .cursor-plugin/plugin.json
 */
export interface CursorPluginManifest {
  name: string;
  version?: string;
  description?: string;
  author?: { name: string; email?: string; url?: string };
  keywords?: string[];
  rules?: string | string[];
  skills?: string | string[];
  mcpServers?: string | Record<string, unknown>;
}
