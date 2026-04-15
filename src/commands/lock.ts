import { Command } from 'commander';
import { resolve } from 'path';
import { green, yellow, red, cyan, dim } from 'kleur/colors';
import { logger } from '../utils/logger.js';
import { InstallLock, getLockEntryTargetLabel } from '../core/installLock.js';
import type { LockEntry, LockEntryKind, LockQueryOptions } from '../types/lockfile.js';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatKind(kind: LockEntryKind): string {
  switch (kind) {
    case 'skill': return cyan('skill');
    case 'mcp': return yellow('mcp');
    case 'rules': return green('rules');
  }
}

function formatSource(entry: LockEntry): string {
  const src = entry.source;
  if (src.type === 'marketplace' && src.marketplace) {
    return `${src.marketplace}/${src.pluginName || ''}`;
  }
  if (src.type === 'github') {
    if (src.owner && src.repo) {
      return src.subpath ? `${src.owner}/${src.repo}/${src.subpath}` : `${src.owner}/${src.repo}`;
    }
    return src.url || 'github';
  }
  if (src.type === 'local' && src.path) {
    return src.path;
  }
  return src.type;
}

export function registerLockCommand(program: Command): void {
  const lock = program
    .command('lock')
    .description('View and manage the global install lockfile');

  // ── lock list ──
  lock
    .command('list')
    .alias('ls')
    .description('List all tracked installations across projects')
    .option('--kind <kind>', 'Filter by kind: skill, mcp, rules')
    .option('--project <path>', 'Filter by project path')
    .option('--agent <agent>', 'Filter by agent ID')
    .option('--scope <scope>', 'Filter by scope: project or global')
    .action(async (options) => {
      const installLock = new InstallLock();
      const queryOptions: LockQueryOptions = {};
      if (options.kind) queryOptions.kind = options.kind as LockEntryKind;
      if (options.project) queryOptions.projectPath = resolve(options.project);
      if (options.agent) queryOptions.agent = options.agent;
      if (options.scope) queryOptions.scope = options.scope;
      const entries = await installLock.getCurrentState(queryOptions);

      if (entries.length === 0) {
        logger.info('No installations tracked in the lockfile.');
        logger.info(dim('Install skills, MCPs, or rules to start tracking.'));
        return;
      }

      // Group by project
      const byProject = new Map<string, { label: string; entries: LockEntry[] }>();
      for (const entry of entries) {
        const key = entry.scope === 'global' ? 'global' : entry.projectPath;
        const group = byProject.get(key) || { label: getLockEntryTargetLabel(entry), entries: [] };
        group.entries.push(entry);
        byProject.set(key, group);
      }

      for (const { label, entries: projectEntries } of byProject.values()) {
        logger.info(`\n${cyan(label)}`);

        for (const entry of projectEntries) {
          const kind = formatKind(entry.kind);
          const scope = entry.scope === 'global' ? dim(' (global)') : '';
          const agents = dim(`[${entry.agents.join(', ')}]`);
          const date = dim(formatTimestamp(entry.timestamp));
          const source = dim(formatSource(entry));

          logger.info(`  ${kind}  ${green(entry.name)}  ${agents}${scope}  ${source}  ${date}`);
        }
      }

      logger.info('');
      logger.info(dim(`${entries.length} installation(s) across ${byProject.size} target(s)`));
    });

  // ── lock status ──
  lock
    .command('status')
    .description('Show summary of tracked installations')
    .option('--check-drift', 'Check for modified skill files (compares content hashes)')
    .action(async (options) => {
      const installLock = new InstallLock();
      const entries = await installLock.getCurrentState();

      if (entries.length === 0) {
        logger.info('No installations tracked in the lockfile.');
        return;
      }

      const projects = new Set(entries.filter(entry => entry.scope === 'project').map(entry => entry.projectPath));
      const globalTargets = entries.filter(entry => entry.scope === 'global');
      const skills = entries.filter(e => e.kind === 'skill');
      const mcps = entries.filter(e => e.kind === 'mcp');
      const rules = entries.filter(e => e.kind === 'rules');

      logger.info(`Projects: ${cyan(projects.size.toString())}`);
      logger.info(`Global targets: ${cyan(globalTargets.length.toString())}`);
      logger.info(`Skills:   ${green(skills.length.toString())}`);
      logger.info(`MCPs:     ${yellow(mcps.length.toString())}`);
      logger.info(`Rules:    ${green(rules.length.toString())}`);

      const stale = await installLock.findStaleProjects();
      if (stale.length > 0) {
        logger.info('');
        logger.info(`${red('Stale projects:')} ${stale.length}`);
        for (const path of stale) {
          logger.info(`  ${red('x')} ${path}`);
        }
        logger.info(dim('Run "agentinit lock prune" to clean up.'));
      }

      if (options.checkDrift) {
        logger.info('');
        logger.info('Checking for drift...');
        let driftCount = 0;
        let missingCount = 0;

        for (const entry of skills) {
          if (!entry.contentHash) continue;
          const result = await installLock.checkDrift(entry);
          if (result.status === 'drift') {
            driftCount++;
            logger.info(`  ${yellow('~')} ${entry.name} in ${entry.projectPath}`);
          } else if (result.status === 'missing') {
            missingCount++;
            logger.info(`  ${red('x')} ${entry.name} in ${entry.projectPath} ${dim('(missing)')}`);
          }
        }

        if (driftCount === 0 && missingCount === 0) {
          logger.info(`  ${green('All skills match their installed hashes.')}`);
        } else {
          if (driftCount > 0) logger.info(`  ${driftCount} skill(s) modified since install`);
          if (missingCount > 0) logger.info(`  ${missingCount} skill(s) missing from disk`);
        }
      }
    });

  // ── lock prune ──
  lock
    .command('prune')
    .description('Remove entries for projects that no longer exist on disk')
    .option('-d, --dry-run', 'Show what would be removed without changing the lockfile')
    .action(async (options) => {
      const installLock = new InstallLock();
      const stale = await installLock.findStaleProjects();

      if (stale.length === 0) {
        logger.info('No stale projects found. Lockfile is clean.');
        return;
      }

      logger.info(`Found ${stale.length} stale project(s):`);
      for (const path of stale) {
        logger.info(`  ${red('x')} ${path}`);
      }

      if (options.dryRun) {
        logger.info(dim('\nDry run — no changes made.'));
        return;
      }

      const result = await installLock.pruneStaleEntries();
      logger.info(`\nRemoved ${result.entriesRemoved} entries for ${result.prunedProjects.length} stale project(s).`);
    });
}
