import { resolve } from 'path';
import { fileExists, readFileIfExists, findFiles } from '../utils/fs.js';
import type { StackInfo } from '../types/index.js';

export class StackDetector {
  private readonly lockFiles = [
    'package-lock.json',
    'yarn.lock', 
    'pnpm-lock.yaml',
    'bun.lockb',
    'Cargo.lock',
    'go.sum',
    'Pipfile.lock',
    'poetry.lock'
  ];

  private readonly manifestFiles = [
    'package.json',
    'Cargo.toml',
    'go.mod',
    'requirements.txt',
    'pyproject.toml',
    'pom.xml',
    'build.gradle'
  ];

  private readonly configFiles = [
    'next.config.js',
    'next.config.ts',
    'vite.config.js',
    'vite.config.ts',
    'webpack.config.js',
    'tsconfig.json',
    'vue.config.js',
    'nuxt.config.js'
  ];

  async detectStack(projectPath: string): Promise<StackInfo> {
    // Step 1: Check lockfiles (most reliable)
    const lockFileInfo = await this.detectFromLockFiles(projectPath);
    if (lockFileInfo) return lockFileInfo;

    // Step 2: Check manifest files
    const manifestInfo = await this.detectFromManifests(projectPath);
    if (manifestInfo) return manifestInfo;

    // Step 3: Check config files
    const configInfo = await this.detectFromConfigs(projectPath);
    if (configInfo) return configInfo;

    // Step 4: Fallback to file patterns
    return await this.detectFromFilePatterns(projectPath);
  }

  private async detectFromLockFiles(projectPath: string): Promise<StackInfo | null> {
    for (const lockFile of this.lockFiles) {
      const lockPath = resolve(projectPath, lockFile);
      if (await fileExists(lockPath)) {
        return this.inferStackFromLockFile(projectPath, lockFile);
      }
    }
    return null;
  }

  private async inferStackFromLockFile(projectPath: string, lockFile: string): Promise<StackInfo> {
    const baseInfo: StackInfo = {
      language: 'unknown',
      dependencies: []
    };

    switch (lockFile) {
      case 'package-lock.json':
      case 'yarn.lock':
      case 'pnpm-lock.yaml':
      case 'bun.lockb':
        return await this.analyzeJavaScriptProject(projectPath);
      
      case 'Cargo.lock':
        return { ...baseInfo, language: 'rust', packageManager: 'cargo' };
      
      case 'go.sum':
        return { ...baseInfo, language: 'go', packageManager: 'go' };
      
      case 'Pipfile.lock':
        return { ...baseInfo, language: 'python', packageManager: 'pipenv' };
      
      case 'poetry.lock':
        return { ...baseInfo, language: 'python', packageManager: 'poetry' };
      
      default:
        return baseInfo;
    }
  }

  private async detectFromManifests(projectPath: string): Promise<StackInfo | null> {
    for (const manifest of this.manifestFiles) {
      const manifestPath = resolve(projectPath, manifest);
      if (await fileExists(manifestPath)) {
        return this.inferStackFromManifest(projectPath, manifest);
      }
    }
    return null;
  }

  private async inferStackFromManifest(projectPath: string, manifest: string): Promise<StackInfo> {
    const baseInfo: StackInfo = {
      language: 'unknown',
      dependencies: []
    };

    switch (manifest) {
      case 'package.json':
        return await this.analyzeJavaScriptProject(projectPath);
      
      case 'Cargo.toml':
        return { ...baseInfo, language: 'rust', packageManager: 'cargo' };
      
      case 'go.mod':
        return { ...baseInfo, language: 'go', packageManager: 'go' };
      
      case 'requirements.txt':
      case 'pyproject.toml':
        return { ...baseInfo, language: 'python', packageManager: 'pip' };
      
      case 'pom.xml':
        return { ...baseInfo, language: 'java', packageManager: 'maven' };
      
      case 'build.gradle':
        return { ...baseInfo, language: 'java', packageManager: 'gradle' };
      
      default:
        return baseInfo;
    }
  }

  private async detectFromConfigs(projectPath: string): Promise<StackInfo | null> {
    for (const config of this.configFiles) {
      const configPath = resolve(projectPath, config);
      if (await fileExists(configPath)) {
        return this.inferStackFromConfig(projectPath, config);
      }
    }
    return null;
  }

  private async inferStackFromConfig(projectPath: string, config: string): Promise<StackInfo> {
    const baseInfo: StackInfo = {
      language: 'javascript',
      dependencies: []
    };

    if (config.includes('next.config')) {
      return { ...baseInfo, framework: 'next.js' };
    }
    if (config.includes('vite.config')) {
      return { ...baseInfo, framework: 'vite' };
    }
    if (config.includes('vue.config')) {
      return { ...baseInfo, framework: 'vue' };
    }
    if (config.includes('nuxt.config')) {
      return { ...baseInfo, framework: 'nuxt' };
    }
    if (config.includes('tsconfig')) {
      return { ...baseInfo, language: 'typescript' };
    }

    return baseInfo;
  }

  private async detectFromFilePatterns(projectPath: string): Promise<StackInfo> {
    const patterns = [
      { pattern: /\.py$/, language: 'python' },
      { pattern: /\.rs$/, language: 'rust' },
      { pattern: /\.go$/, language: 'go' },
      { pattern: /\.ts$/, language: 'typescript' },
      { pattern: /\.js$/, language: 'javascript' },
      { pattern: /\.java$/, language: 'java' },
      { pattern: /\.kt$/, language: 'kotlin' },
      { pattern: /\.swift$/, language: 'swift' }
    ];

    const counts = new Map<string, number>();

    for (const { pattern, language } of patterns) {
      const files = await findFiles(projectPath, pattern);
      counts.set(language, files.length);
    }

    // Find the most common language
    let maxCount = 0;
    let detectedLanguage = 'unknown';

    for (const [language, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        detectedLanguage = language;
      }
    }

    return {
      language: detectedLanguage,
      dependencies: []
    };
  }

  private async analyzeJavaScriptProject(projectPath: string): Promise<StackInfo> {
    const packageJsonPath = resolve(projectPath, 'package.json');
    const packageJsonContent = await readFileIfExists(packageJsonPath);
    
    const info: StackInfo = {
      language: 'javascript',
      dependencies: []
    };

    if (!packageJsonContent) return info;

    try {
      const packageJson = JSON.parse(packageJsonContent);
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      info.dependencies = Object.keys(allDeps);

      // Detect TypeScript
      if (allDeps.typescript || await fileExists(resolve(projectPath, 'tsconfig.json'))) {
        info.language = 'typescript';
      }

      // Detect framework
      if (allDeps.next) info.framework = 'next.js';
      else if (allDeps.react) info.framework = 'react';
      else if (allDeps.vue) info.framework = 'vue';
      else if (allDeps['@angular/core']) info.framework = 'angular';
      else if (allDeps.svelte) info.framework = 'svelte';
      else if (allDeps.express) info.framework = 'express';
      else if (allDeps.fastify) info.framework = 'fastify';

      // Detect package manager
      if (await fileExists(resolve(projectPath, 'yarn.lock'))) info.packageManager = 'yarn';
      else if (await fileExists(resolve(projectPath, 'pnpm-lock.yaml'))) info.packageManager = 'pnpm';
      else if (await fileExists(resolve(projectPath, 'bun.lockb'))) info.packageManager = 'bun';
      else info.packageManager = 'npm';

      // Detect test framework
      if (allDeps.jest) info.testFramework = 'jest';
      else if (allDeps.vitest) info.testFramework = 'vitest';
      else if (allDeps.mocha) info.testFramework = 'mocha';
      else if (allDeps.playwright) info.testFramework = 'playwright';

    } catch (error) {
      // Invalid package.json, return basic info
    }

    return info;
  }
}