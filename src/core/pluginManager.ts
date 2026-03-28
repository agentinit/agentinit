import { resolve, join, basename } from 'path';
import { promises as fs } from 'fs';
import { homedir, tmpdir } from 'os';
import matter from 'gray-matter';
import { readFileIfExists, fileExists, isDirectory, listFiles, writeFile } from '../utils/fs.js';
import { AgentManager } from './agentManager.js';
import { MCPFilter } from './mcpFilter.js';
import { SkillsManager } from './skillsManager.js';
import type { Agent } from '../agents/Agent.js';
import type { MCPServerConfig, MCPServerType } from '../types/index.js';
import type { SkillInfo } from '../types/skills.js';
import type {
  NormalizedPlugin,
  PluginSource,
  PluginFormat,
  MarketplaceRegistry,
  MarketplacePlugin,
  InstalledPlugin,
  PluginRegistry,
  PluginInstallOptions,
  PluginInstallResult,
  ClaudePluginManifest,
  CursorPluginManifest,
} from '../types/plugins.js';

/**
 * Built-in marketplace registries
 */
const MARKETPLACES: MarketplaceRegistry[] = [
  {
    id: 'claude',
    name: 'Claude Plugins Official',
    repoUrl: 'https://github.com/anthropics/claude-plugins-official.git',
    pluginDirs: ['plugins', 'external_plugins'],
    cacheTtlMs: 3600000, // 1 hour
  },
  // Future: cursor, codex, gemini registries
];

function getMarketplaceCacheDir(registryId: string): string {
  return join(homedir(), '.agentinit', 'marketplace-cache', registryId);
}

function getRegistryPath(projectPath: string, global?: boolean): string {
  if (global) {
    return join(homedir(), '.agentinit', 'plugins.json');
  }
  return join(projectPath, '.agentinit', 'plugins.json');
}

export class PluginManager {
  private agentManager: AgentManager;
  private skillsManager: SkillsManager;

  constructor(agentManager?: AgentManager) {
    this.agentManager = agentManager || new AgentManager();
    this.skillsManager = new SkillsManager(this.agentManager);
  }

  // ── Source Resolution ──────────────────────────────────────────────

  /**
   * Resolve a source string into a PluginSource.
   * Supported forms:
   * - local path
   * - full GitHub URL / git URL
   * - marketplace prefix: <marketplace>/<plugin>
   * - GitHub shorthand: owner/repo
   * - marketplace override via --from <marketplace> <plugin>
   */
  resolveSource(source: string, options?: { from?: string | undefined }): PluginSource {
    // Local path
    if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
      return { type: 'local', path: source };
    }

    // GitHub URL
    if (source.startsWith('https://github.com/') || source.startsWith('http://github.com/')) {
      const url = source.replace(/\.git$/, '');
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      return {
        type: 'github',
        url: `https://github.com/${match?.[1]}/${match?.[2]}.git`,
        owner: match?.[1],
        repo: match?.[2],
      };
    }

    // Git URL
    if (source.startsWith('git@') || source.endsWith('.git')) {
      return { type: 'github', url: source };
    }

    // Explicit marketplace override
    if (options?.from) {
      if (!this.getMarketplace(options.from)) {
        throw new Error(`Unknown marketplace: ${options.from}. Available: ${this.getMarketplaceIds().join(', ')}`);
      }

      return {
        type: 'marketplace',
        marketplace: options.from,
        pluginName: source,
      };
    }

    const marketplacePrefixMatch = source.match(/^([a-zA-Z0-9._-]+)\/(.+)$/);
    if (marketplacePrefixMatch) {
      const [, marketplaceId, pluginName] = marketplacePrefixMatch;
      if (marketplaceId && pluginName && this.getMarketplace(marketplaceId)) {
        return {
          type: 'marketplace',
          marketplace: marketplaceId,
          pluginName,
        };
      }
    }

    // GitHub shorthand: owner/repo
    if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(source)) {
      const [owner, repo] = source.split('/');
      return {
        type: 'github',
        url: `https://github.com/${owner}/${repo}.git`,
        owner,
        repo,
      };
    }

    throw new Error(
      `Ambiguous plugin source "${source}". Use <marketplace>/<plugin> (for example, claude/${source}), --from <marketplace>, a GitHub repo, or a local path.`
    );
  }

  // ── Marketplace ────────────────────────────────────────────────────

  getMarketplaceIds(): string[] {
    return MARKETPLACES.map(marketplace => marketplace.id);
  }

  /**
   * Get a marketplace registry by ID
   */
  getMarketplace(id: string): MarketplaceRegistry | undefined {
    return MARKETPLACES.find(m => m.id === id);
  }

  /**
   * Ensure the marketplace cache is fresh. Clone if missing or stale.
   */
  async ensureMarketplaceCache(registryId: string): Promise<string> {
    const registry = this.getMarketplace(registryId);
    if (!registry) {
      throw new Error(`Unknown marketplace: ${registryId}. Available: ${MARKETPLACES.map(m => m.id).join(', ')}`);
    }

    const cacheDir = getMarketplaceCacheDir(registryId);
    const cacheMetaPath = join(cacheDir, '.agentinit-cache-meta.json');

    // Check if cache exists and is fresh
    if (await fileExists(cacheMetaPath)) {
      try {
        const meta = JSON.parse(await fs.readFile(cacheMetaPath, 'utf8'));
        const age = Date.now() - (meta.fetchedAt || 0);
        if (age < registry.cacheTtlMs) {
          return cacheDir;
        }
      } catch {
        // Corrupt meta, re-fetch
      }
    }

    // Clone or update
    if (await fileExists(join(cacheDir, '.git'))) {
      // Pull latest
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const exec = promisify(execFile);
      try {
        await exec('git', ['pull', '--ff-only'], { cwd: cacheDir, timeout: 30000 });
      } catch {
        // Pull failed, re-clone
        await fs.rm(cacheDir, { recursive: true, force: true });
        await this.cloneMarketplace(registry.repoUrl, cacheDir);
      }
    } else {
      await this.cloneMarketplace(registry.repoUrl, cacheDir);
    }

    // Write cache meta
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheMetaPath, JSON.stringify({ fetchedAt: Date.now() }));
    return cacheDir;
  }

  private async cloneMarketplace(repoUrl: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    // Remove dest first if it exists (for re-clone)
    await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
    await exec('git', ['clone', '--depth', '1', repoUrl, dest], { timeout: 60000 });
  }

  /**
   * Find a plugin by name in a marketplace
   */
  async resolveMarketplacePlugin(name: string, registryId: string): Promise<string> {
    const registry = this.getMarketplace(registryId);
    if (!registry) throw new Error(`Unknown marketplace: ${registryId}`);

    const cacheDir = await this.ensureMarketplaceCache(registryId);

    // Search in each plugin directory
    for (const dir of registry.pluginDirs) {
      const pluginPath = join(cacheDir, dir, name);
      if (await isDirectory(pluginPath)) {
        return pluginPath;
      }
    }

    // Not found — suggest similar names
    const available = await this.listMarketplacePlugins(registryId);
    const suggestions = available
      .filter(p => p.name.includes(name) || name.includes(p.name))
      .map(p => p.name)
      .slice(0, 5);

    let msg = `Plugin "${name}" not found in ${registry.name} marketplace.`;
    if (suggestions.length > 0) {
      msg += ` Did you mean: ${suggestions.join(', ')}?`;
    }
    throw new Error(msg);
  }

  /**
   * List all plugins in a marketplace, optionally filtered
   */
  async listMarketplacePlugins(registryId: string, query?: string, category?: string): Promise<MarketplacePlugin[]> {
    const registry = this.getMarketplace(registryId);
    if (!registry) throw new Error(`Unknown marketplace: ${registryId}`);

    const cacheDir = await this.ensureMarketplaceCache(registryId);
    const results: MarketplacePlugin[] = [];

    for (const dir of registry.pluginDirs) {
      const fullDir = join(cacheDir, dir);
      if (!(await isDirectory(fullDir))) continue;

      const cat = dir === 'plugins' ? 'official' : dir === 'external_plugins' ? 'community' : dir;
      if (category && cat !== category) continue;

      const entries = await listFiles(fullDir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const entryPath = join(fullDir, entry);
        if (!(await isDirectory(entryPath))) continue;

        // Try to read plugin manifest
        const manifestPath = join(entryPath, '.claude-plugin', 'plugin.json');
        let name = entry;
        let description = '';
        let version = '0.0.0';

        if (await fileExists(manifestPath)) {
          try {
            const manifest: ClaudePluginManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
            name = manifest.name || entry;
            description = manifest.description || '';
            version = manifest.version || '0.0.0';
          } catch { /* use defaults */ }
        }

        if (query) {
          const q = query.toLowerCase();
          if (!name.toLowerCase().includes(q) && !description.toLowerCase().includes(q)) {
            continue;
          }
        }

        results.push({ name, description, version, path: `${dir}/${entry}`, category: cat, registry: registryId });
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Format Detection ───────────────────────────────────────────────

  /**
   * Auto-detect plugin format from directory contents
   */
  async detectFormat(pluginDir: string): Promise<PluginFormat> {
    if (await fileExists(join(pluginDir, '.claude-plugin', 'plugin.json'))) {
      return 'claude';
    }
    if (await fileExists(join(pluginDir, '.cursor-plugin', 'plugin.json'))) {
      return 'cursor';
    }
    return 'generic';
  }

  // ── Format Parsers ─────────────────────────────────────────────────

  /**
   * Parse a plugin directory into a NormalizedPlugin, auto-detecting format
   */
  async parsePlugin(pluginDir: string, source: PluginSource): Promise<NormalizedPlugin> {
    const format = await this.detectFormat(pluginDir);

    switch (format) {
      case 'claude':
        return this.parseClaudePlugin(pluginDir, source);
      case 'cursor':
        return this.parseCursorPlugin(pluginDir, source);
      default:
        return this.parseGenericPlugin(pluginDir, source);
    }
  }

  /**
   * Parse Claude plugin format
   */
  async parseClaudePlugin(pluginDir: string, source: PluginSource): Promise<NormalizedPlugin> {
    const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
    const manifestContent = await readFileIfExists(manifestPath);
    if (!manifestContent) {
      throw new Error(`Missing .claude-plugin/plugin.json in ${pluginDir}`);
    }

    const manifest: ClaudePluginManifest = JSON.parse(manifestContent);
    const warnings: string[] = [];

    // Extract skills
    const skills = await this.skillsManager.discoverSkills(pluginDir);

    // Convert commands/ to skills
    const convertedSkills = await this.convertCommandsToSkills(pluginDir, manifest);
    skills.push(...convertedSkills);

    // Extract MCP servers
    const mcpServers = await this.parseMcpJson(pluginDir);

    // Warn about agent-specific features
    if (await isDirectory(join(pluginDir, 'hooks')) || manifest.hooks) {
      warnings.push('Hooks (hooks/) are Claude Code-specific and were not installed');
    }
    if (await isDirectory(join(pluginDir, 'agents')) || manifest.agents) {
      warnings.push('Agent definitions (agents/) are Claude Code-specific and were not installed');
    }

    return {
      name: manifest.name,
      version: manifest.version || '0.0.0',
      description: manifest.description || '',
      source,
      format: 'claude',
      skills,
      mcpServers,
      warnings,
    };
  }

  /**
   * Parse Cursor plugin format
   */
  async parseCursorPlugin(pluginDir: string, source: PluginSource): Promise<NormalizedPlugin> {
    const manifestPath = join(pluginDir, '.cursor-plugin', 'plugin.json');
    const manifestContent = await readFileIfExists(manifestPath);
    if (!manifestContent) {
      throw new Error(`Missing .cursor-plugin/plugin.json in ${pluginDir}`);
    }

    const manifest: CursorPluginManifest = JSON.parse(manifestContent);
    const warnings: string[] = [];

    // Extract skills
    const skills = await this.skillsManager.discoverSkills(pluginDir);

    // Extract MCP servers from .mcp.json (Cursor also uses this)
    const mcpServers = await this.parseMcpJson(pluginDir);

    // Warn about Cursor-specific features
    if (manifest.rules) {
      warnings.push('Rules (.mdc files) are Cursor-specific and were not installed');
    }

    return {
      name: manifest.name,
      version: manifest.version || '0.0.0',
      description: manifest.description || '',
      source,
      format: 'cursor',
      skills,
      mcpServers,
      warnings,
    };
  }

  /**
   * Parse generic plugin (just skills/ and .mcp.json, no manifest)
   */
  async parseGenericPlugin(pluginDir: string, source: PluginSource): Promise<NormalizedPlugin> {
    const skills = await this.skillsManager.discoverSkills(pluginDir);
    const mcpServers = await this.parseMcpJson(pluginDir);
    const dirName = basename(pluginDir);

    return {
      name: dirName,
      version: '0.0.0',
      description: '',
      source,
      format: 'generic',
      skills,
      mcpServers,
      warnings: [],
    };
  }

  // ── MCP Parsing ────────────────────────────────────────────────────

  /**
   * Parse .mcp.json from a plugin directory into MCPServerConfig[]
   * Handles the { mcpServers: { name: config } } format used by Claude and Cursor
   */
  async parseMcpJson(pluginDir: string): Promise<MCPServerConfig[]> {
    const mcpPath = join(pluginDir, '.mcp.json');
    const content = await readFileIfExists(mcpPath);
    if (!content) return [];

    try {
      const config = JSON.parse(content);
      return this.parseMcpJsonObject(config);
    } catch {
      return [];
    }
  }

  /**
   * Parse a raw MCP JSON config object into MCPServerConfig[]
   */
  parseMcpJsonObject(config: any): MCPServerConfig[] {
    const servers: MCPServerConfig[] = [];
    const mcpServers = config.mcpServers || config;

    if (typeof mcpServers !== 'object' || mcpServers === null) return [];

    for (const [name, serverConfig] of Object.entries(mcpServers)) {
      const sc = serverConfig as any;
      if (!sc || typeof sc !== 'object') continue;

      const server: MCPServerConfig = {
        name,
        type: (sc.type || (sc.command ? 'stdio' : sc.url ? 'http' : 'stdio')) as MCPServerType,
      };

      if (sc.command) server.command = sc.command;
      if (sc.args) server.args = sc.args;
      if (sc.env) server.env = sc.env;
      if (sc.url) server.url = sc.url;
      if (sc.headers) server.headers = sc.headers;

      servers.push(server);
    }

    return servers;
  }

  // ── Command → Skill Conversion ─────────────────────────────────────

  /**
   * Convert commands/*.md files to SKILL.md format
   */
  async convertCommandsToSkills(pluginDir: string, manifest: ClaudePluginManifest): Promise<SkillInfo[]> {
    const skills: SkillInfo[] = [];

    // Determine commands directory
    const commandsDirs: string[] = [];
    if (manifest.commands) {
      const cmds = Array.isArray(manifest.commands) ? manifest.commands : [manifest.commands];
      for (const cmd of cmds) {
        commandsDirs.push(resolve(pluginDir, cmd));
      }
    } else {
      commandsDirs.push(join(pluginDir, 'commands'));
    }

    for (const commandsDir of commandsDirs) {
      if (!(await isDirectory(commandsDir))) continue;

      const entries = await listFiles(commandsDir);
      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue;

        const cmdPath = join(commandsDir, entry);
        const skill = await this.convertSingleCommandToSkill(cmdPath, manifest.name);
        if (skill) skills.push(skill);
      }
    }

    return skills;
  }

  /**
   * Convert a single command .md file to a skill
   */
  private async convertSingleCommandToSkill(cmdPath: string, pluginName: string): Promise<SkillInfo | null> {
    const content = await readFileIfExists(cmdPath);
    if (!content) return null;

    const fileName = basename(cmdPath, '.md');
    let skillName: string;
    let description: string;
    let body: string;

    try {
      const parsed = matter(content);
      skillName = (parsed.data.name as string) || fileName;
      description = (parsed.data.description as string) || `Command from ${pluginName} plugin`;
      body = parsed.content;
    } catch {
      skillName = fileName;
      description = `Command from ${pluginName} plugin`;
      body = content;
    }

    // Create a temp skill directory with SKILL.md
    const tempDir = join(tmpdir(), `agentinit-plugin-cmd-${Date.now()}-${skillName}`);
    await fs.mkdir(tempDir, { recursive: true });

    const skillContent = `---
name: ${skillName}
description: ${description}
version: 1.0.0
---

${body.trim()}
`;

    await fs.writeFile(join(tempDir, 'SKILL.md'), skillContent, 'utf8');
    return { name: skillName, description, path: tempDir };
  }

  // ── Installation ───────────────────────────────────────────────────

  /**
   * Install a plugin from any source into target agents.
   * This is the main one-liner entry point.
   */
  async installPlugin(
    source: string,
    projectPath: string,
    options: PluginInstallOptions = {}
  ): Promise<PluginInstallResult> {
    const resolved = this.resolveSource(source, { from: options.from });
    let pluginDir: string;
    let tempDir: string | null = null;

    // 1. Resolve source to a local directory
    if (resolved.type === 'marketplace') {
      pluginDir = await this.resolveMarketplacePlugin(
        resolved.pluginName!,
        resolved.marketplace || 'claude'
      );
    } else if (resolved.type === 'github') {
      if (!resolved.url) throw new Error(`Invalid source: ${source}`);
      tempDir = await this.skillsManager.cloneRepo(resolved.url);
      pluginDir = tempDir;
    } else {
      pluginDir = resolve(resolved.path || source);
      if (!(await fileExists(pluginDir))) {
        throw new Error(`Local path not found: ${pluginDir}`);
      }
    }

    try {
      // 2. Parse plugin
      const plugin = await this.parsePlugin(pluginDir, resolved);

      // 3. If --list, return early with contents
      if (options.list) {
        return {
          plugin,
          skills: { installed: [], skipped: [] },
          mcpServers: { applied: [], skipped: [] },
          warnings: plugin.warnings,
        };
      }

      // 4. Get target agents
      const agents = await this.getTargetAgents(projectPath, options);
      if (agents.length === 0) {
        return {
          plugin,
          skills: { installed: [], skipped: plugin.skills.map(s => ({ name: s.name, reason: 'No target agents found' })) },
          mcpServers: { applied: [], skipped: plugin.mcpServers.map(s => ({ name: s.name, reason: 'No target agents found' })) },
          warnings: plugin.warnings,
        };
      }

      // 5. Install skills (deduplicated by shared directory)
      const skillResult = await this.installPluginSkills(plugin, projectPath, agents, options);

      // 6. Apply MCP servers per agent
      const mcpResult = await this.applyPluginMcpServers(plugin, projectPath, agents, options.global);

      // 7. Save to registry
      const installed: InstalledPlugin = {
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        source: resolved,
        format: plugin.format,
        installedAt: new Date().toISOString(),
        scope: options.global ? 'global' : 'project',
        components: {
          skills: skillResult.installed,
          mcpServers: mcpResult.applied,
        },
        warnings: plugin.warnings,
      };
      await this.addToRegistry(installed, projectPath, options.global);

      return {
        plugin,
        skills: skillResult,
        mcpServers: mcpResult,
        warnings: plugin.warnings,
      };
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
      // Clean up temp command-to-skill dirs
    }
  }

  /**
   * Install skills from a plugin, deduplicating by shared directory
   */
  private async installPluginSkills(
    plugin: NormalizedPlugin,
    projectPath: string,
    agents: Agent[],
    options: PluginInstallOptions
  ): Promise<{ installed: Array<{ name: string; agent: string; path: string }>; skipped: Array<{ name: string; reason: string }> }> {
    const installed: Array<{ name: string; agent: string; path: string }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    if (plugin.skills.length === 0) return { installed, skipped };

    // Group agents by their skills directory to avoid duplicate installs
    const dirToAgents = new Map<string, Agent[]>();
    for (const agent of agents) {
      if (!agent.supportsSkills()) {
        for (const skill of plugin.skills) {
          skipped.push({ name: skill.name, reason: `${agent.name} does not support skills` });
        }
        continue;
      }

      const skillsDir = agent.getSkillsDir(projectPath, options.global);
      if (!skillsDir) {
        for (const skill of plugin.skills) {
          skipped.push({ name: skill.name, reason: `No skills directory for ${agent.name}` });
        }
        continue;
      }

      const existing = dirToAgents.get(skillsDir) || [];
      existing.push(agent);
      dirToAgents.set(skillsDir, existing);
    }

    // Install once per unique directory
    for (const [skillsDir, dirAgents] of dirToAgents) {
      for (const skill of plugin.skills) {
        try {
          const installedPath = await this.skillsManager.installSkill(
            skill.path,
            skill.name,
            skillsDir,
            true // Plugins always copy to avoid temp/cache symlink issues.
          );

          // Record for all agents sharing this directory
          for (const agent of dirAgents) {
            installed.push({ name: skill.name, agent: agent.id, path: installedPath });
          }
        } catch (error: any) {
          skipped.push({ name: skill.name, reason: error.message });
        }
      }
    }

    return { installed, skipped };
  }

  /**
   * Apply MCP servers from a plugin to each target agent
   */
  private async applyPluginMcpServers(
    plugin: NormalizedPlugin,
    projectPath: string,
    agents: Agent[],
    global?: boolean
  ): Promise<{ applied: Array<{ name: string; agent: string }>; skipped: Array<{ name: string; reason: string }> }> {
    const applied: Array<{ name: string; agent: string }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    if (plugin.mcpServers.length === 0) return { applied, skipped };

    for (const agent of agents) {
      if (global && !agent.supportsGlobalConfig()) {
        for (const server of plugin.mcpServers) {
          skipped.push({ name: server.name, reason: `${agent.name} does not support global MCP configuration` });
        }
        continue;
      }

      // Filter and transform MCP servers for this agent
      const filtered = MCPFilter.filterForAgent(agent, plugin.mcpServers);

      if (filtered.servers.length === 0) {
        for (const server of plugin.mcpServers) {
          skipped.push({ name: server.name, reason: `Not compatible with ${agent.name}` });
        }
        continue;
      }

      try {
        if (global) {
          await agent.applyGlobalMCPConfig(filtered.servers);
        } else {
          await agent.applyMCPConfig(projectPath, filtered.servers);
        }
        for (const server of filtered.servers) {
          applied.push({ name: server.name, agent: agent.id });
        }
      } catch (error: any) {
        for (const server of filtered.servers) {
          skipped.push({ name: server.name, reason: `Failed for ${agent.name}: ${error.message}` });
        }
      }
    }

    return { applied, skipped };
  }

  // ── Agent Selection ────────────────────────────────────────────────

  /**
   * Get target agents based on options
   */
  async getTargetAgents(projectPath: string, options: PluginInstallOptions = {}): Promise<Agent[]> {
    if (options.agents && options.agents.length > 0) {
      const agents: Agent[] = [];
      for (const id of options.agents) {
        const agent = this.agentManager.getAgentById(id);
        if (agent) agents.push(agent);
      }
      return agents;
    }

    // Auto-detect agents in the project
    const detected = await this.agentManager.detectAgents(projectPath);
    return detected.map(d => d.agent);
  }

  /**
   * Group detected agents by their shared skills directory for interactive prompt.
   * Returns entries like: { dir: '.agents/', agents: [cursor, codex, gemini] }
   */
  async groupAgentsBySkillsDir(
    projectPath: string,
    global?: boolean
  ): Promise<Array<{ dir: string; agents: Agent[]; agentNames: string[] }>> {
    const detected = await this.agentManager.detectAgents(projectPath);
    const dirToAgents = new Map<string, Agent[]>();

    for (const { agent } of detected) {
      if (!agent.supportsSkills()) continue;
      const skillsDir = agent.getSkillsDir(projectPath, global);
      if (!skillsDir) continue;

      // Use a relative display path
      const relDir = skillsDir.startsWith(projectPath)
        ? skillsDir.slice(projectPath.length + 1).replace(/\/$/, '') + '/'
        : skillsDir;

      const existing = dirToAgents.get(relDir) || [];
      existing.push(agent);
      dirToAgents.set(relDir, existing);
    }

    return Array.from(dirToAgents.entries()).map(([dir, agents]) => ({
      dir,
      agents,
      agentNames: agents.map(a => a.name),
    }));
  }

  // ── Registry ───────────────────────────────────────────────────────

  /**
   * Read the plugin registry
   */
  async getRegistry(projectPath: string, global?: boolean): Promise<PluginRegistry> {
    const path = getRegistryPath(projectPath, global);
    const content = await readFileIfExists(path);
    if (!content) return { version: 1, plugins: [] };

    try {
      return JSON.parse(content);
    } catch {
      return { version: 1, plugins: [] };
    }
  }

  /**
   * Save the plugin registry
   */
  async saveRegistry(registry: PluginRegistry, projectPath: string, global?: boolean): Promise<void> {
    const path = getRegistryPath(projectPath, global);
    await writeFile(path, JSON.stringify(registry, null, 2));
  }

  /**
   * Add an installed plugin to the registry
   */
  async addToRegistry(plugin: InstalledPlugin, projectPath: string, global?: boolean): Promise<void> {
    const registry = await this.getRegistry(projectPath, global);

    // Replace existing entry with same name
    registry.plugins = registry.plugins.filter(p => p.name !== plugin.name);
    registry.plugins.push(plugin);

    await this.saveRegistry(registry, projectPath, global);
  }

  /**
   * List all installed plugins
   */
  async listPlugins(projectPath: string, options: { global?: boolean; agents?: string[] } = {}): Promise<InstalledPlugin[]> {
    const registry = await this.getRegistry(projectPath, options.global);
    let plugins = registry.plugins;

    if (options.agents && options.agents.length > 0) {
      const agentSet = new Set(options.agents);
      plugins = plugins.filter(p =>
        p.components.skills.some(s => agentSet.has(s.agent)) ||
        p.components.mcpServers.some(m => agentSet.has(m.agent))
      );
    }

    return plugins;
  }

  /**
   * Remove a plugin by name
   */
  async removePlugin(
    name: string,
    projectPath: string,
    options: { global?: boolean; agents?: string[]; yes?: boolean } = {}
  ): Promise<{ removed: boolean; details: string[] }> {
    const registry = await this.getRegistry(projectPath, options.global);
    const plugin = registry.plugins.find(p => p.name === name);

    if (!plugin) {
      return { removed: false, details: [`Plugin "${name}" not found in registry`] };
    }

    const details: string[] = [];
    const agentFilter = options.agents?.length ? new Set(options.agents) : null;

    const targetedSkills = agentFilter
      ? plugin.components.skills.filter(skill => agentFilter.has(skill.agent))
      : plugin.components.skills;
    const retainedSkills = agentFilter
      ? plugin.components.skills.filter(skill => !agentFilter.has(skill.agent))
      : [];
    const retainedSkillPaths = new Set(retainedSkills.map(skill => skill.path));

    const removedSkillPaths = new Set<string>();
    const sharedSkillPaths = new Set<string>();
    for (const skill of targetedSkills) {
      if (removedSkillPaths.has(skill.path) || sharedSkillPaths.has(skill.path)) {
        continue;
      }

      if (retainedSkillPaths.has(skill.path)) {
        sharedSkillPaths.add(skill.path);
        details.push(`Skipped shared skill path: ${skill.path}`);
        continue;
      }

      try {
        await fs.rm(skill.path, { recursive: true, force: true });
        removedSkillPaths.add(skill.path);
      } catch {
        details.push(`Could not remove skill path: ${skill.path}`);
      }
    }

    const removedSkills = targetedSkills.filter(skill => removedSkillPaths.has(skill.path));
    for (const skill of removedSkills) {
      details.push(`Removed skill: ${skill.name} (${skill.agent})`);
    }

    const remainingSkills = [
      ...retainedSkills,
      ...targetedSkills.filter(skill => !removedSkillPaths.has(skill.path)),
    ];

    const targetedMcpServers = agentFilter
      ? plugin.components.mcpServers.filter(mcp => agentFilter.has(mcp.agent))
      : plugin.components.mcpServers;
    const retainedMcpServers = agentFilter
      ? plugin.components.mcpServers.filter(mcp => !agentFilter.has(mcp.agent))
      : [];

    const removedMcpKeys = new Set<string>();
    for (const mcp of targetedMcpServers) {
      const agent = this.agentManager.getAgentById(mcp.agent);
      if (!agent) {
        details.push(`Could not resolve agent for MCP server: ${mcp.name} (${mcp.agent})`);
        continue;
      }

      try {
        const removed = options.global
          ? await agent.removeGlobalMCPServer(mcp.name)
          : await agent.removeMCPServer(projectPath, mcp.name);
        if (removed) {
          removedMcpKeys.add(`${mcp.agent}:${mcp.name}`);
          details.push(`Removed MCP server: ${mcp.name} (${mcp.agent})`);
        } else {
          details.push(`MCP server not found: ${mcp.name} (${mcp.agent})`);
        }
      } catch {
        details.push(`Could not remove MCP server: ${mcp.name} from ${mcp.agent}`);
      }
    }

    const remainingMcpServers = [
      ...retainedMcpServers,
      ...targetedMcpServers.filter(mcp => !removedMcpKeys.has(`${mcp.agent}:${mcp.name}`)),
    ];

    if (removedSkillPaths.size === 0 && removedMcpKeys.size === 0) {
      if (agentFilter) {
        details.push(`No removable plugin components matched the requested agents for "${name}"`);
      }
      return { removed: false, details };
    }

    const updatedPlugin: InstalledPlugin = {
      ...plugin,
      components: {
        skills: remainingSkills,
        mcpServers: remainingMcpServers,
      },
    };

    registry.plugins = registry.plugins.filter(p => p.name !== name);
    if (updatedPlugin.components.skills.length > 0 || updatedPlugin.components.mcpServers.length > 0) {
      registry.plugins.push(updatedPlugin);
      details.push('Updated plugin registry');
    } else {
      details.push('Removed from plugin registry');
    }

    await this.saveRegistry(registry, projectPath, options.global);

    return { removed: true, details };
  }
}
