import { resolve, join, relative, basename, dirname } from 'path';
import { promises as fs } from 'fs';
import { homedir, tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import matter from 'gray-matter';
import {
  createRelativeSymlink,
  fileExists,
  isDirectory,
  listFiles,
  readFileIfExists,
  resolveRealPathOrSelf,
} from '../utils/fs.js';
import { AgentManager } from './agentManager.js';
import { getConfiguredDefaultMarketplaceId, getMarketplace, getMarketplaceIds } from './marketplaceRegistry.js';
import type { Agent } from '../agents/Agent.js';
import type {
  SkillInfo,
  InstalledSkill,
  SkillInstallResult,
  SkillsAddOptions,
  SkillsAddResult,
  SkillsListOptions,
  SkillsRemoveOptions,
  SkillsRemoveResult,
  SkillSource
} from '../types/skills.js';
import { SHARED_SKILLS_TARGET_ID } from '../types/skills.js';

const execFileAsync = promisify(execFile);
const DEFAULT_SKILLS_CATALOG = {
  owner: 'vercel-labs',
  repo: 'agent-skills',
  url: 'https://github.com/vercel-labs/agent-skills.git',
};

/**
 * Standard directories where skills are discovered in a repository
 * Compatible with the open agent skills ecosystem (vercel-labs/skills)
 */
const SKILL_SEARCH_DIRS = [
  '.',
  'skills',
  'skills/.curated',
  'skills/.experimental',
  '.agents/skills',
  '.claude/skills',
  '.factory/skills',
];

type LoadedSkillsContext = {
  skills: SkillInfo[];
  warnings: string[];
  cleanup: () => Promise<void>;
};

export class SkillsManager {
  private agentManager: AgentManager;
  private preparedSourceContexts = new Map<string, LoadedSkillsContext>();

  constructor(agentManager?: AgentManager) {
    this.agentManager = agentManager || new AgentManager();
  }

  /**
   * Parse a source string into a structured SkillSource
   */
  resolveSource(source: string, options?: { from?: string }): SkillSource {
    // Local path
    if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
      return { type: 'local', path: source };
    }

    // Full GitHub URL
    const githubUrlSource = this.parseGitHubHttpSource(source);
    if (githubUrlSource) {
      return githubUrlSource;
    }

    // Full git URL
    if (source.startsWith('git@') || source.endsWith('.git')) {
      return { type: 'github', url: source };
    }

    if (options?.from) {
      if (!getMarketplace(options.from)) {
        throw new Error(`Unknown marketplace: ${options.from}. Available: ${getMarketplaceIds().join(', ')}`);
      }

      return {
        type: 'marketplace',
        marketplace: options.from,
        pluginName: source,
      };
    }

    const githubShorthandSource = this.parseGitHubShorthandSource(source);
    if (githubShorthandSource?.subpath) {
      return githubShorthandSource;
    }

    const marketplacePrefixMatch = source.match(/^([a-zA-Z0-9._-]+)\/(.+)$/);
    if (marketplacePrefixMatch) {
      const [, marketplaceId, pluginName] = marketplacePrefixMatch;
      if (marketplaceId && pluginName && getMarketplace(marketplaceId)) {
        return {
          type: 'marketplace',
          marketplace: marketplaceId,
          pluginName,
        };
      }
    }

    if (githubShorthandSource) {
      return githubShorthandSource;
    }

    // Fallback: treat as local path
    return { type: 'local', path: source };
  }

  private isImplicitCatalogSkillSource(source: string, options?: { from?: string }): boolean {
    const normalizedSource = source.trim();

    if (!normalizedSource || options?.from) {
      return false;
    }

    return !(
      normalizedSource.startsWith('.') ||
      normalizedSource.startsWith('/') ||
      normalizedSource.startsWith('~') ||
      normalizedSource.startsWith('https://') ||
      normalizedSource.startsWith('http://') ||
      normalizedSource.startsWith('git@') ||
      normalizedSource.endsWith('.git') ||
      normalizedSource.includes('/') ||
      normalizedSource.includes('\\')
    );
  }

  private resolveSourceRequest(
    source: string,
    options?: { from?: string },
  ): { source: SkillSource; implicitSkills: string[] } {
    if (this.isImplicitCatalogSkillSource(source, options)) {
      const configuredDefaultMarketplace = getConfiguredDefaultMarketplaceId();
      if (configuredDefaultMarketplace) {
        return {
          source: {
            type: 'marketplace',
            marketplace: configuredDefaultMarketplace,
            pluginName: source.trim(),
          },
          implicitSkills: [],
        };
      }

      return {
        source: {
          type: 'github',
          owner: DEFAULT_SKILLS_CATALOG.owner,
          repo: DEFAULT_SKILLS_CATALOG.repo,
          url: DEFAULT_SKILLS_CATALOG.url,
        },
        implicitSkills: [source.trim()],
      };
    }

    return {
      source: this.resolveSource(source, options),
      implicitSkills: [],
    };
  }

  private parseGitHubHttpSource(source: string): SkillSource | null {
    if (!source.startsWith('https://github.com/') && !source.startsWith('http://github.com/')) {
      return null;
    }

    try {
      const parsedUrl = new URL(source);
      const segments = parsedUrl.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      if (segments.length < 2) {
        return null;
      }

      const [owner, rawRepo, ...rest] = segments;
      const repo = rawRepo?.replace(/\.git$/, '');
      if (!owner || !repo) {
        return null;
      }

      let subpath: string | undefined;
      if (rest[0] === 'tree' || rest[0] === 'blob') {
        if (rest.length > 2) {
          subpath = rest.slice(2).join('/');
        }
      } else if (rest.length > 0) {
        subpath = rest.join('/');
      }

      return {
        type: 'github',
        url: `https://github.com/${owner}/${repo}.git`,
        owner,
        repo,
        ...(subpath ? { subpath } : {}),
      };
    } catch {
      return null;
    }
  }

  private parseGitHubShorthandSource(source: string): SkillSource | null {
    const githubShorthandMatch = source.match(/^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)(?:\/(.+))?$/);
    if (!githubShorthandMatch) {
      return null;
    }

    const [, owner, repo, subpath] = githubShorthandMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      owner,
      repo,
      ...(subpath ? { subpath } : {}),
    };
  }

  /**
   * Parse a SKILL.md file and extract name + description from frontmatter
   */
  async parseSkillMd(filePath: string): Promise<{ name: string; description: string } | null> {
    const content = await readFileIfExists(filePath);
    if (!content) return null;

    try {
      const parsed = matter(content);
      const { name, description } = parsed.data;
      if (!name || !description) return null;
      return { name: String(name), description: String(description) };
    } catch {
      return null;
    }
  }

  /**
   * Discover all skills in a given directory (cloned repo or local path)
   */
  async discoverSkills(repoPath: string): Promise<SkillInfo[]> {
    const skills: SkillInfo[] = [];
    const seen = new Set<string>();

    for (const searchDir of SKILL_SEARCH_DIRS) {
      const fullDir = resolve(repoPath, searchDir);
      if (!(await fileExists(fullDir))) continue;

      // Check if this directory itself has a SKILL.md
      const directSkillMd = join(fullDir, 'SKILL.md');
      if (await fileExists(directSkillMd)) {
        // Check lowercase variant too
        const parsed = await this.parseSkillMd(directSkillMd);
        if (parsed && !seen.has(parsed.name)) {
          seen.add(parsed.name);
          skills.push({ ...parsed, path: resolve(fullDir) });
        }
      }

      // Also check lowercase
      const directSkillMdLower = join(fullDir, 'skill.md');
      if (await fileExists(directSkillMdLower)) {
        const parsed = await this.parseSkillMd(directSkillMdLower);
        if (parsed && !seen.has(parsed.name)) {
          seen.add(parsed.name);
          skills.push({ ...parsed, path: resolve(fullDir) });
        }
      }

      // Check subdirectories for skill folders
      if (!(await isDirectory(fullDir))) continue;
      const entries = await listFiles(fullDir);

      for (const entry of entries) {
        const entryPath = join(fullDir, entry);
        if (!(await isDirectory(entryPath))) continue;

        // Look for SKILL.md in subdirectory
        const skillMdPath = join(entryPath, 'SKILL.md');
        const skillMdPathLower = join(entryPath, 'skill.md');
        const skillFile = (await fileExists(skillMdPath)) ? skillMdPath
          : (await fileExists(skillMdPathLower)) ? skillMdPathLower
          : null;

        if (!skillFile) continue;

        const parsed = await this.parseSkillMd(skillFile);
        if (parsed && !seen.has(parsed.name)) {
          seen.add(parsed.name);
          skills.push({ ...parsed, path: entryPath });
        }
      }
    }

    return skills;
  }

  /**
   * Clone a GitHub repository to a temp directory
   */
  async cloneRepo(url: string): Promise<string> {
    const tempDir = await fs.mkdtemp(join(tmpdir(), 'agentinit-skills-'));
    await fs.rm(tempDir, { recursive: true, force: true });

    try {
      await execFileAsync('git', ['clone', '--depth', '1', url, tempDir], {
        timeout: 60000
      });
    } catch (error: any) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw new Error(`Failed to clone ${url}: ${error.message}`);
    }

    return tempDir;
  }

  private getMarketplaceSourceId(source: SkillSource): string {
    if (source.type !== 'marketplace' || !source.marketplace || !source.pluginName) {
      throw new Error('Invalid marketplace skill source');
    }

    return `${source.marketplace}/${source.pluginName}`;
  }

  private getMissingLocalPathError(source: string, resolvedPath: string): Error {
    const normalizedSource = source.trim();

    if (!normalizedSource || normalizedSource.startsWith('.') || normalizedSource.startsWith('/') || normalizedSource.startsWith('~')) {
      return new Error(`Local path not found: ${resolvedPath}`);
    }

    const marketplaces = getMarketplaceIds();
    const marketplaceHints = marketplaces.length > 0
      ? ` If you meant a marketplace skill, use "${marketplaces[0]}/${normalizedSource}" or "--from ${marketplaces[0]}".`
      : '';

    return new Error(
      `Local path not found: ${resolvedPath}. If you meant a local path, prefix it with "./".${marketplaceHints}`
    );
  }

  private async discoverMarketplaceSkills(
    source: SkillSource,
    projectPath: string,
  ): Promise<{ skills: SkillInfo[]; warnings: string[] }> {
    const { PluginManager } = await import('./pluginManager.js');
    const pluginManager = new PluginManager(this.agentManager);

    const result = await pluginManager.installPlugin(source.pluginName || this.getMarketplaceSourceId(source), projectPath, {
      from: source.marketplace,
      list: true,
    });

    const warnings = [...result.warnings];
    if (result.plugin.mcpServers.length > 0) {
      warnings.push(
        `Source "${this.getMarketplaceSourceId(source)}" also includes ${result.plugin.mcpServers.length} MCP server(s); use "agentinit plugins install ${this.getMarketplaceSourceId(source)}" to install them.`
      );
    }

    return {
      skills: result.plugin.skills,
      warnings,
    };
  }

  private async discoverPortablePluginSkills(
    repoPath: string,
    sourceLabel: string,
    source: SkillSource,
    projectPath: string,
  ): Promise<{ skills: SkillInfo[]; warnings: string[] } | null> {
    const { PluginManager } = await import('./pluginManager.js');
    const pluginManager = new PluginManager(this.agentManager);
    const plugin = await pluginManager.loadPluginFromDirectory(repoPath, source);

    if (plugin.skills.length === 0 && plugin.mcpServers.length === 0 && plugin.warnings.length === 0) {
      return null;
    }

    const warnings = [...plugin.warnings];
    if (plugin.mcpServers.length > 0) {
      warnings.push(
        `Source "${sourceLabel}" also includes ${plugin.mcpServers.length} MCP server(s); use "agentinit plugins install ${sourceLabel}" to install them.`
      );
    }

    return {
      skills: plugin.skills,
      warnings,
    };
  }

  private async cleanupTempDir(tempDir: string | null): Promise<void> {
    if (!tempDir) {
      return;
    }

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  private async resolveDiscoveryRoot(
    repoPath: string,
    source: SkillSource,
    sourceLabel: string,
  ): Promise<string> {
    const resolvedRepoPath = resolve(repoPath);
    if (source.type !== 'github' || !source.subpath) {
      return resolvedRepoPath;
    }

    const discoveryRoot = resolve(resolvedRepoPath, source.subpath);
    if (!this.isWithinPath(resolvedRepoPath, discoveryRoot)) {
      throw new Error(`Invalid GitHub source path "${source.subpath}" in ${sourceLabel}`);
    }

    if (!(await fileExists(discoveryRoot))) {
      throw new Error(`Source path not found in repository: ${sourceLabel}`);
    }

    const [realRepoPath, realDiscoveryRoot] = await Promise.all([
      resolveRealPathOrSelf(resolvedRepoPath),
      resolveRealPathOrSelf(discoveryRoot),
    ]);
    if (!this.isWithinPath(realRepoPath, realDiscoveryRoot)) {
      throw new Error(`Invalid GitHub source path "${source.subpath}" in ${sourceLabel}`);
    }

    if (await isDirectory(realDiscoveryRoot)) {
      return realDiscoveryRoot;
    }

    if (basename(realDiscoveryRoot).toLowerCase() === 'skill.md') {
      return dirname(realDiscoveryRoot);
    }

    throw new Error(`GitHub source must reference a skill directory or SKILL.md: ${sourceLabel}`);
  }

  private async loadDiscoveredSkillsContext(
    source: string,
    projectPath: string,
    options: { from?: string } = {},
  ): Promise<LoadedSkillsContext> {
    const request = this.resolveSourceRequest(source, options);
    const resolved = request.source;
    let tempDir: string | null = null;
    const cleanup = async () => {
      await this.cleanupTempDir(tempDir);
      tempDir = null;
    };

    try {
      if (resolved.type === 'marketplace') {
        const discovered = await this.discoverMarketplaceSkills(resolved, projectPath);
        return {
          ...discovered,
          cleanup,
        };
      }

      let repoPath: string;
      if (resolved.type === 'github') {
        if (!resolved.url) {
          throw new Error(`Invalid source: ${source}`);
        }

        tempDir = await this.cloneRepo(resolved.url);
        repoPath = tempDir;
      } else {
        repoPath = resolve(resolved.path || source);
        if (!(await fileExists(repoPath))) {
          throw this.getMissingLocalPathError(source, repoPath);
        }
      }

      const discoveryRoot = await this.resolveDiscoveryRoot(repoPath, resolved, source);
      let skills = await this.discoverSkills(discoveryRoot);
      let pluginWarnings: string[] = [];
      if (skills.length === 0) {
        const pluginBackedSkills = await this.discoverPortablePluginSkills(discoveryRoot, source, resolved, projectPath);
        if (pluginBackedSkills) {
          skills = pluginBackedSkills.skills;
          pluginWarnings = pluginBackedSkills.warnings;
        }
      }

      if (request.implicitSkills.length > 0) {
        const names = new Set(request.implicitSkills.map(skill => skill.toLowerCase()));
        skills = skills.filter(skill => names.has(skill.name.toLowerCase()));
      }

      const warnings = [
        ...pluginWarnings,
        ...(request.implicitSkills.length > 0
          ? [`Resolved "${source}" from the default skills catalog ${DEFAULT_SKILLS_CATALOG.owner}/${DEFAULT_SKILLS_CATALOG.repo}. Use "./${source}" for a local path.`]
          : []),
      ];

      return { skills, warnings, cleanup };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  async discoverFromSource(
    source: string,
    projectPath: string,
    options: { from?: string } = {},
  ): Promise<{ skills: SkillInfo[]; warnings: string[] }> {
    const context = await this.loadDiscoveredSkillsContext(source, projectPath, options);
    try {
      return {
        skills: context.skills,
        warnings: context.warnings,
      };
    } finally {
      await context.cleanup();
    }
  }

  private getPreparedSourceKey(source: string, projectPath: string, from?: string): string {
    return `${projectPath}\n${from || ''}\n${source}`;
  }

  private async storePreparedSourceContext(
    source: string,
    projectPath: string,
    from: string | undefined,
    context: LoadedSkillsContext,
  ): Promise<void> {
    const key = this.getPreparedSourceKey(source, projectPath, from);
    const existing = this.preparedSourceContexts.get(key);
    this.preparedSourceContexts.set(key, context);
    if (existing && existing !== context) {
      await existing.cleanup();
    }
  }

  private takePreparedSourceContext(source: string, projectPath: string, from?: string): LoadedSkillsContext | null {
    const key = this.getPreparedSourceKey(source, projectPath, from);
    const existing = this.preparedSourceContexts.get(key) || null;
    if (existing) {
      this.preparedSourceContexts.delete(key);
    }
    return existing;
  }

  async prepareSource(
    source: string,
    projectPath: string,
    options: { from?: string } = {},
  ): Promise<{ skills: SkillInfo[]; warnings: string[] }> {
    const context = await this.loadDiscoveredSkillsContext(source, projectPath, options);
    await this.storePreparedSourceContext(source, projectPath, options.from, context);
    return {
      skills: context.skills,
      warnings: context.warnings,
    };
  }

  async discardPreparedSource(
    source: string,
    projectPath: string,
    options: { from?: string } = {},
  ): Promise<void> {
    const context = this.takePreparedSourceContext(source, projectPath, options.from);
    await context?.cleanup();
  }

  /**
   * Get target agents based on options
   */
  async getTargetAgents(projectPath: string, options: { agents?: string[]; global?: boolean }): Promise<Agent[]> {
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
   * Install a skill directory into an agent's skills directory
   */
  async installSkill(
    skillPath: string,
    skillName: string,
    targetDir: string,
    copy: boolean = false
  ): Promise<string> {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const destPath = this.resolveInstallPath(targetDir, normalizedSkillName);
    await fs.mkdir(resolve(targetDir), { recursive: true });

    // Remove existing if present
    if (await fileExists(destPath)) {
      await fs.rm(destPath, { recursive: true, force: true });
    }

    if (copy) {
      await this.copyDir(skillPath, destPath);
    } else {
      await fs.symlink(skillPath, destPath, 'dir');
    }

    return destPath;
  }

  async installSkillFromContent(
    skillName: string,
    skillContent: string,
    targetDir: string,
  ): Promise<string> {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const destPath = this.resolveInstallPath(targetDir, normalizedSkillName);
    await fs.mkdir(resolve(targetDir), { recursive: true });

    if (await fileExists(destPath)) {
      await fs.rm(destPath, { recursive: true, force: true });
    }

    await fs.mkdir(destPath, { recursive: true });
    await fs.writeFile(join(destPath, 'SKILL.md'), skillContent, 'utf8');

    return destPath;
  }

  getCanonicalSkillsDir(projectPath: string, global: boolean = false): string {
    return global
      ? resolve(homedir(), '.agents/skills')
      : resolve(projectPath, '.agents/skills');
  }

  async getInstallPlan(
    skillName: string,
    agent: Agent,
    projectPath: string,
    options: { global?: boolean; copy?: boolean } = {}
  ): Promise<SkillInstallResult> {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const skillsDir = agent.getSkillsDir(projectPath, options.global);

    if (!skillsDir) {
      throw new Error(`No skills directory for ${agent.name}`);
    }

    const agentPath = this.resolveInstallPath(skillsDir, normalizedSkillName);
    if (options.copy) {
      return {
        path: agentPath,
        mode: 'copy',
      };
    }

    const canonicalPath = this.resolveInstallPath(
      this.getCanonicalSkillsDir(projectPath, options.global ?? false),
      normalizedSkillName,
    );

    if (agentPath === canonicalPath) {
      return {
        path: canonicalPath,
        canonicalPath,
        mode: 'symlink',
      };
    }

    return {
      path: agentPath,
      canonicalPath,
      mode: 'symlink',
    };
  }

  async installSkillForAgent(
    skillPath: string,
    skillName: string,
    agent: Agent,
    projectPath: string,
    options: { global?: boolean; copy?: boolean } = {}
  ): Promise<SkillInstallResult> {
    const plan = await this.getInstallPlan(skillName, agent, projectPath, options);
    const skillsDir = agent.getSkillsDir(projectPath, options.global);

    if (!skillsDir) {
      throw new Error(`No skills directory for ${agent.name}`);
    }

    if (plan.mode === 'copy') {
      await this.installSkill(skillPath, skillName, skillsDir, true);
      return plan;
    }

    const canonicalPath = plan.canonicalPath;
    if (!canonicalPath) {
      throw new Error(`Missing canonical path for ${skillName}`);
    }

    await this.cleanAndCreateDirectory(canonicalPath);
    await this.copyDir(skillPath, canonicalPath);

    if (plan.path === canonicalPath) {
      return plan;
    }

    const symlinkCreated = await createRelativeSymlink(canonicalPath, plan.path);
    if (!symlinkCreated) {
      await this.cleanAndCreateDirectory(plan.path);
      await this.copyDir(skillPath, plan.path);
      return {
        ...plan,
        symlinkFailed: true,
      };
    }

    return plan;
  }

  async installSkillFromContentForAgent(
    skillName: string,
    skillContent: string,
    agent: Agent,
    projectPath: string,
    options: { global?: boolean; copy?: boolean } = {}
  ): Promise<SkillInstallResult> {
    const plan = await this.getInstallPlan(skillName, agent, projectPath, options);
    const skillsDir = agent.getSkillsDir(projectPath, options.global);

    if (!skillsDir) {
      throw new Error(`No skills directory for ${agent.name}`);
    }

    if (plan.mode === 'copy') {
      await this.installSkillFromContent(skillName, skillContent, skillsDir);
      return plan;
    }

    const canonicalPath = plan.canonicalPath;
    if (!canonicalPath) {
      throw new Error(`Missing canonical path for ${skillName}`);
    }

    await this.cleanAndCreateDirectory(canonicalPath);
    await fs.writeFile(join(canonicalPath, 'SKILL.md'), skillContent, 'utf8');

    if (plan.path === canonicalPath) {
      return plan;
    }

    const symlinkCreated = await createRelativeSymlink(canonicalPath, plan.path);
    if (!symlinkCreated) {
      await this.installSkillFromContent(skillName, skillContent, skillsDir);
      return {
        ...plan,
        symlinkFailed: true,
      };
    }

    return plan;
  }

  async installSkillToCanonicalStore(
    skillPath: string,
    skillName: string,
    projectPath: string,
    options: { global?: boolean } = {},
  ): Promise<SkillInstallResult> {
    const plan = this.getCanonicalInstallPlan(skillName, projectPath, options);
    await this.cleanAndCreateDirectory(plan.path);
    await this.copyDir(skillPath, plan.path);
    return plan;
  }

  async installSkillFromContentToCanonicalStore(
    skillName: string,
    skillContent: string,
    projectPath: string,
    options: { global?: boolean } = {},
  ): Promise<SkillInstallResult> {
    const plan = this.getCanonicalInstallPlan(skillName, projectPath, options);
    await this.cleanAndCreateDirectory(plan.path);
    await fs.writeFile(join(plan.path, 'SKILL.md'), skillContent, 'utf8');
    return plan;
  }

  private getCanonicalInstallPlan(
    skillName: string,
    projectPath: string,
    options: { global?: boolean } = {},
  ): SkillInstallResult {
    const normalizedSkillName = this.normalizeSkillName(skillName);
    const canonicalPath = this.resolveInstallPath(
      this.getCanonicalSkillsDir(projectPath, options.global ?? false),
      normalizedSkillName,
    );

    return {
      path: canonicalPath,
      canonicalPath,
      mode: 'symlink',
    };
  }

  private normalizeSkillName(skillName: string): string {
    const normalized = skillName.trim();

    if (!normalized) {
      throw new Error('Skill name cannot be empty');
    }

    if (normalized === '.' || normalized === '..' || normalized.includes('/') || normalized.includes('\\')) {
      throw new Error(`Invalid skill name: ${skillName}`);
    }

    return normalized;
  }

  private resolveInstallPath(targetDir: string, skillName: string): string {
    const resolvedTargetDir = resolve(targetDir);
    const destPath = resolve(resolvedTargetDir, skillName);
    const relativePath = relative(resolvedTargetDir, destPath);

    if (relativePath === '' || relativePath.startsWith('..') || relativePath.includes('/../') || relativePath.includes('\\..\\')) {
      throw new Error(`Refusing to install skill outside target directory: ${skillName}`);
    }

    return destPath;
  }

  getInstallPath(skillName: string, targetDir: string): string {
    return this.resolveInstallPath(targetDir, this.normalizeSkillName(skillName));
  }

  private async cleanAndCreateDirectory(path: string): Promise<void> {
    await fs.rm(path, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(path, { recursive: true });
  }

  private isWithinPath(basePath: string, targetPath: string): boolean {
    const relativePath = relative(resolve(basePath), resolve(targetPath));
    return relativePath === '' || (
      !relativePath.startsWith('..') &&
      !relativePath.includes('/../') &&
      !relativePath.includes('\\..\\')
    );
  }

  /**
   * Recursively copy a directory
   */
  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.cp(src, dest, { recursive: true, dereference: true });
  }

  /**
   * Add skills from a source (GitHub repo or local path)
   */
  async addFromSource(
    source: string,
    projectPath: string,
    options: SkillsAddOptions = {}
  ): Promise<SkillsAddResult> {
    const context = this.takePreparedSourceContext(source, projectPath, options.from)
      || await this.loadDiscoveredSkillsContext(source, projectPath, {
        ...(options.from !== undefined ? { from: options.from } : {}),
      });
    try {
      let skills = context.skills;

      if (skills.length === 0) {
        return { installed: [], skipped: [], warnings: context.warnings };
      }

      if (options.skills && options.skills.length > 0) {
        const names = new Set(options.skills.map(skill => skill.toLowerCase()));
        skills = skills.filter(skill => names.has(skill.name.toLowerCase()));
      }

      const installToSharedStore = options.agents?.includes(SHARED_SKILLS_TARGET_ID) ?? false;
      const agents = await this.getTargetAgents(projectPath, options);
      if (agents.length === 0 && !installToSharedStore) {
        return {
          installed: [],
          skipped: skills.map(skill => ({ skill, reason: 'No target agents found' })),
          warnings: context.warnings,
        };
      }

      const result: SkillsAddResult = { installed: [], skipped: [], warnings: context.warnings };
      const installableAgents: Agent[] = [];

      if (installToSharedStore) {
        for (const skill of skills) {
          try {
            const installOptions = {
              ...(options.global !== undefined ? { global: options.global } : {}),
            };
            const installed = skill.generatedContent
              ? await this.installSkillFromContentToCanonicalStore(
                skill.name,
                skill.generatedContent,
                projectPath,
                installOptions,
              )
              : await this.installSkillToCanonicalStore(
                skill.path,
                skill.name,
                projectPath,
                installOptions
              );

            result.installed.push({ skill, agent: SHARED_SKILLS_TARGET_ID, ...installed });
          } catch (error: any) {
            result.skipped.push({ skill, reason: error.message });
          }
        }
      }

      for (const agent of agents) {
        if (!agent.supportsSkills()) {
          for (const skill of skills) {
            result.skipped.push({ skill, reason: `${agent.name} does not support skills` });
          }
          continue;
        }

        const skillsDir = agent.getSkillsDir(projectPath, options.global);
        if (!skillsDir) {
          for (const skill of skills) {
            result.skipped.push({ skill, reason: `No skills directory for ${agent.name}` });
          }
          continue;
        }

        installableAgents.push(agent);
      }

      for (const skill of skills) {
        for (const agent of installableAgents) {
          try {
            const installOptions = {
              ...(options.global !== undefined ? { global: options.global } : {}),
              ...(options.copy !== undefined ? { copy: options.copy } : {}),
            };
            const installed = skill.generatedContent
              ? await this.installSkillFromContentForAgent(
                skill.name,
                skill.generatedContent,
                agent,
                projectPath,
                installOptions,
              )
              : await this.installSkillForAgent(
                skill.path,
                skill.name,
                agent,
                projectPath,
                installOptions
              );

            result.installed.push({ skill, agent: agent.id, ...installed });
          } catch (error: any) {
            result.skipped.push({ skill, reason: error.message });
          }
        }
      }

      return result;
    } finally {
      await context.cleanup();
    }
  }

  /**
   * List all installed skills
   */
  async listInstalled(projectPath: string, options: SkillsListOptions = {}): Promise<InstalledSkill[]> {
    const agents = await this.getTargetAgents(projectPath, options);
    return this.listInstalledForAgents(projectPath, agents, options);
  }

  private async listInstalledForAgents(
    projectPath: string,
    agents: Agent[],
    options: SkillsListOptions = {}
  ): Promise<InstalledSkill[]> {
    const installed: InstalledSkill[] = [];

    for (const agent of agents) {
      if (!agent.supportsSkills()) continue;

      // Check both project and global scopes
      const scopes: Array<{ scope: 'project' | 'global'; dir: string | null }> = [];

      if (!options.global) {
        scopes.push({ scope: 'project', dir: agent.getSkillsDir(projectPath, false) });
      }
      scopes.push({ scope: 'global', dir: agent.getSkillsDir(projectPath, true) });

      for (const { scope, dir } of scopes) {
        if (!dir || !(await fileExists(dir))) continue;

        const entries = await listFiles(dir);
        for (const entry of entries) {
          const entryPath = join(dir, entry);
          if (!(await isDirectory(entryPath))) continue;

          // Look for SKILL.md
          const skillMdPath = join(entryPath, 'SKILL.md');
          const skillMdPathLower = join(entryPath, 'skill.md');
          const skillFile = (await fileExists(skillMdPath)) ? skillMdPath
            : (await fileExists(skillMdPathLower)) ? skillMdPathLower
            : null;

          if (!skillFile) continue;

          const parsed = await this.parseSkillMd(skillFile);
          if (!parsed) continue;

          // Check if it's a symlink
          let isSymlink = false;
          let canonicalPath: string | undefined;
          try {
            const stat = await fs.lstat(entryPath);
            isSymlink = stat.isSymbolicLink();
            const canonicalBase = this.getCanonicalSkillsDir(projectPath, scope === 'global');
            const [resolvedEntryPath, resolvedCanonicalBase] = await Promise.all([
              resolveRealPathOrSelf(entryPath),
              resolveRealPathOrSelf(canonicalBase),
            ]);
            if (this.isWithinPath(resolvedCanonicalBase, resolvedEntryPath)) {
              canonicalPath = resolvedEntryPath;
            } else if (this.isWithinPath(canonicalBase, entryPath)) {
              canonicalPath = resolve(entryPath);
            }
          } catch {}

          installed.push({
            name: parsed.name,
            description: parsed.description,
            path: entryPath,
            agent: agent.id,
            scope,
            isSymlink,
            mode: canonicalPath ? 'symlink' : 'copy',
            ...(canonicalPath ? { canonicalPath } : {}),
          });
        }
      }
    }

    const includeSharedTarget = !options.agents || options.agents.includes(SHARED_SKILLS_TARGET_ID);
    if (includeSharedTarget) {
      const scopes: Array<'project' | 'global'> = options.global ? ['global'] : ['project', 'global'];
      const referencedCanonicalPaths = new Set(
        installed
          .map(entry => entry.canonicalPath)
          .filter((value): value is string => !!value)
          .map(value => resolve(value))
      );

      for (const scope of scopes) {
        const canonicalDir = this.getCanonicalSkillsDir(projectPath, scope === 'global');
        if (!(await fileExists(canonicalDir))) continue;

        const entries = await listFiles(canonicalDir);
        for (const entry of entries) {
          const entryPath = join(canonicalDir, entry);
          if (!(await isDirectory(entryPath))) continue;

          const resolvedEntryPath = resolve(entryPath);
          if (referencedCanonicalPaths.has(resolvedEntryPath)) continue;

          const skillMdPath = join(entryPath, 'SKILL.md');
          const skillMdPathLower = join(entryPath, 'skill.md');
          const skillFile = (await fileExists(skillMdPath)) ? skillMdPath
            : (await fileExists(skillMdPathLower)) ? skillMdPathLower
            : null;

          if (!skillFile) continue;

          const parsed = await this.parseSkillMd(skillFile);
          if (!parsed) continue;

          installed.push({
            name: parsed.name,
            description: parsed.description,
            path: entryPath,
            canonicalPath: resolvedEntryPath,
            agent: SHARED_SKILLS_TARGET_ID,
            scope,
            isSymlink: false,
            mode: 'symlink',
          });
        }
      }
    }

    return installed;
  }

  /**
   * Remove installed skills by name
   */
  async remove(
    skillNames: string[],
    projectPath: string,
    options: SkillsRemoveOptions = {}
  ): Promise<SkillsRemoveResult> {
    const agents = await this.getTargetAgents(projectPath, options);
    const allAgents = this.agentManager.getAllAgents().filter(agent => agent.supportsSkills());
    const removed: string[] = [];
    const notFound: string[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    const namesLower = new Set(skillNames.map(n => n.toLowerCase()));
    const targetAgentIds = new Set(agents.map(agent => agent.id));
    if (options.agents?.includes(SHARED_SKILLS_TARGET_ID) || options.agents === undefined) {
      targetAgentIds.add(SHARED_SKILLS_TARGET_ID);
    }
    const installed = await this.listInstalledForAgents(projectPath, allAgents, options);
    const sharedTargetInstalled = options.agents?.includes(SHARED_SKILLS_TARGET_ID)
      ? await this.listInstalledForAgents(projectPath, [], options)
      : [];
    const installedEntries = Array.from(new Map(
      [...installed, ...sharedTargetInstalled].map(entry => [
        `${entry.agent}:${entry.scope}:${entry.path}:${entry.name}`,
        entry,
      ])
    ).values());
    const scopedInstalled = installedEntries.filter(entry =>
      options.global ? entry.scope === 'global' : entry.scope === 'project'
    );
    const targetedEntries = scopedInstalled.filter(entry =>
      targetAgentIds.has(entry.agent) &&
      namesLower.has(entry.name.toLowerCase())
    );
    const targetedKeys = new Set(
      targetedEntries.map(entry => `${entry.agent}:${entry.scope}:${entry.path}:${entry.name}`)
    );
    const remainingEntries = installedEntries.filter(
      entry => !targetedKeys.has(`${entry.agent}:${entry.scope}:${entry.path}:${entry.name}`)
    );
    const removedPaths = new Set<string>();
    const removedCanonicalPaths = new Set<string>();

    for (const entry of targetedEntries) {
      const removedEntry = `${entry.agent}:${entry.name}`;

      if (entry.canonicalPath && entry.path === entry.canonicalPath) {
        const stillReferenced = remainingEntries.some(other =>
          other.name.toLowerCase() === entry.name.toLowerCase() &&
          other.canonicalPath === entry.canonicalPath
        );

        if (stillReferenced) {
          skipped.push({
            name: entry.name,
            reason: `Shared canonical path still used by another agent: ${entry.canonicalPath}`,
          });
          continue;
        }
      }

      const sharedPathStillReferenced = remainingEntries.some(other =>
        other.name.toLowerCase() === entry.name.toLowerCase() &&
        other.scope === entry.scope &&
        other.path === entry.path
      );

      if (sharedPathStillReferenced) {
        skipped.push({
          name: entry.name,
          reason: `Shared skill path still used by another agent: ${entry.path}`,
        });
        continue;
      }

      if (!removedPaths.has(entry.path)) {
        try {
          await fs.rm(entry.path, { recursive: true, force: true });
          removedPaths.add(entry.path);
        } catch {
          skipped.push({
            name: entry.name,
            reason: `Could not remove skill path: ${entry.path}`,
          });
          continue;
        }
      }

      if (
        entry.canonicalPath &&
        entry.canonicalPath !== entry.path &&
        !removedCanonicalPaths.has(entry.canonicalPath)
      ) {
        const stillReferenced = remainingEntries.some(other =>
          other.name.toLowerCase() === entry.name.toLowerCase() &&
          other.canonicalPath === entry.canonicalPath
        );

        if (!stillReferenced) {
          await fs.rm(entry.canonicalPath, { recursive: true, force: true }).catch(() => {});
          removedCanonicalPaths.add(entry.canonicalPath);
        }
      }

      removed.push(removedEntry);
    }

    // Check which names were not found anywhere
    const foundNames = new Set(targetedEntries.map(entry => entry.name.toLowerCase()));
    for (const name of skillNames) {
      if (!foundNames.has(name.toLowerCase())) {
        notFound.push(name);
      }
    }

    return { removed, notFound, skipped };
  }
}
