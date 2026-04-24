import { promises as fs } from 'fs';
import { join, relative } from 'path';
import type { SkillInfo } from '../types/skills.js';

type SkillScanSeverity = 'high' | 'medium' | 'low';

interface SkillScanRule {
  id: string;
  title: string;
  severity: SkillScanSeverity;
  regex: RegExp;
}

export interface SkillScanFinding {
  ruleId: string;
  title: string;
  severity: SkillScanSeverity;
  filePath: string;
  line: number;
  snippet: string;
  blocking: boolean;
}

export interface SkillScanResult {
  blocked: boolean;
  findings: SkillScanFinding[];
  stats: Record<SkillScanSeverity, number>;
}

const SCAN_RULES: SkillScanRule[] = [
  {
    id: 'AI001',
    title: 'Prompt override language',
    severity: 'medium',
    regex: /\b(ignore|disregard|override|bypass)\b.{0,40}\b(previous|prior|system|safety|guardrails?|instructions?)\b/i,
  },
  {
    id: 'AI002',
    title: 'Secret or credential exfiltration',
    severity: 'high',
    regex: /\b(exfiltrat\w*|upload|send|post|curl|wget)\b.{0,80}\b(secret|token|key|credential|cookie|session|\.ssh|id_rsa|env(?:ironment)? variables?)\b/i,
  },
  {
    id: 'AI003',
    title: 'Destructive shell command',
    severity: 'high',
    regex: /\b(rm\s+-rf\s+\/|sudo\s+rm\s+-rf|mkfs\b|dd\s+if=\/dev\/zero|chmod\s+-R\s+777\s+\/)\b/i,
  },
  {
    id: 'AI004',
    title: 'Remote shell execution pipeline',
    severity: 'high',
    regex: /\b(curl|wget)\b[^\n|]{0,160}\|\s*(sh|bash|zsh)\b/i,
  },
  {
    id: 'AI005',
    title: 'Hardcoded credential material',
    severity: 'low',
    regex: /\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    id: 'AI006',
    title: 'Unicode bidi control characters',
    severity: 'low',
    regex: /[\u202A-\u202E\u2066-\u2069]/,
  },
];

const MAX_TEXT_FILE_BYTES = 1024 * 1024;
const SCANNED_TEXT_EXTENSIONS = new Set([
  '',
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.js',
  '.ts',
  '.mjs',
  '.cjs',
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.ps1',
]);

const EXECUTABLE_TEXT_EXTENSIONS = new Set([
  '.js',
  '.ts',
  '.mjs',
  '.cjs',
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.ps1',
]);

export class SkillSecurityScanner {
  async scanSkill(skill: SkillInfo): Promise<SkillScanResult> {
    const findings = skill.generatedContent
      ? this.scanText(skill.generatedContent, 'SKILL.md')
      : await this.scanDirectory(skill.path);

    const stats = findings.reduce<Record<SkillScanSeverity, number>>((acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    }, { high: 0, medium: 0, low: 0 });

    return {
      blocked: findings.some(finding => finding.blocking),
      findings,
      stats,
    };
  }

  formatShortSummary(result: SkillScanResult): string {
    const parts = [
      result.stats.high ? `${result.stats.high} high` : null,
      result.stats.medium ? `${result.stats.medium} medium` : null,
      result.stats.low ? `${result.stats.low} low` : null,
    ].filter((value): value is string => !!value);

    return parts.length > 0 ? parts.join(', ') : 'no findings';
  }

  formatBlockingReason(result: SkillScanResult): string {
    const finding = result.findings.find(entry => entry.blocking)
      || result.findings.find(entry => entry.severity === 'high')
      || result.findings[0];
    if (!finding) {
      return 'Security scan failed';
    }

    return `Security scan failed: ${finding.title} (${finding.ruleId}) at ${finding.filePath}:${finding.line}`;
  }

  private async scanDirectory(rootPath: string): Promise<SkillScanFinding[]> {
    const findings: SkillScanFinding[] = [];
    await this.walk(rootPath, rootPath, findings);
    return findings;
  }

  private async walk(rootPath: string, currentPath: string, findings: SkillScanFinding[]): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await this.walk(rootPath, entryPath, findings);
        continue;
      }

      const relativePath = relative(rootPath, entryPath).replace(/\\/g, '/');
      const content = await this.readTextFile(entryPath);
      if (content === null) {
        continue;
      }

      findings.push(...this.scanText(content, relativePath, {
        blockHighRisk: this.isExecutableTextFile(entryPath, content),
      }));
    }
  }

  private async readTextFile(filePath: string): Promise<string | null> {
    const extension = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : '';
    if (!SCANNED_TEXT_EXTENSIONS.has(extension)) {
      return null;
    }

    const buffer = await fs.readFile(filePath);
    if (buffer.length > MAX_TEXT_FILE_BYTES || buffer.includes(0)) {
      return null;
    }

    return buffer.toString('utf8');
  }

  private isExecutableTextFile(filePath: string, content: string): boolean {
    const extension = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : '';
    return EXECUTABLE_TEXT_EXTENSIONS.has(extension) || content.startsWith('#!');
  }

  private scanText(
    content: string,
    filePath: string,
    options: { blockHighRisk?: boolean } = {},
  ): SkillScanFinding[] {
    const findings: SkillScanFinding[] = [];
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const rule of SCAN_RULES) {
        rule.regex.lastIndex = 0;
        if (!rule.regex.test(line)) {
          continue;
        }

        findings.push({
          ruleId: rule.id,
          title: rule.title,
          severity: rule.severity,
          filePath,
          line: index + 1,
          snippet: line.trim().slice(0, 160),
          blocking: rule.severity === 'high' && options.blockHighRisk === true,
        });
      }
    });

    return findings;
  }
}
