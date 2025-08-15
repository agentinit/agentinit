import { resolve } from 'path';
import ora from 'ora';
import prompts from 'prompts';
import { logger } from '../utils/logger.js';
import { fileExists, writeFile } from '../utils/fs.js';
import { AgentDetector } from '../core/agentDetector.js';
import { StackDetector } from '../core/stackDetector.js';
import { TemplateEngine } from '../core/templateEngine.js';
import type { ProjectConfig } from '../types/index.js';

interface InitOptions {
  force?: boolean;
  template?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const agentsPath = resolve(cwd, 'agents.md');
  
  logger.title('🚀 AgentInit - Initialize Project');
  
  // Check if agents.md already exists
  if (!options.force && await fileExists(agentsPath)) {
    const response = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'agents.md already exists. Do you want to overwrite it?',
      initial: false
    });
    
    if (!response.overwrite) {
      logger.info('Initialization cancelled');
      return;
    }
  }
  
  const spinner = ora('Analyzing project...').start();
  
  try {
    // Detect existing agents and stack
    const agentDetector = new AgentDetector();
    const stackDetector = new StackDetector();
    
    const [agents, stack] = await Promise.all([
      agentDetector.detectAgents(cwd),
      stackDetector.detectStack(cwd)
    ]);
    
    spinner.succeed('Project analysis complete');
    
    // Show detection results
    if (agents.length > 0) {
      logger.info(`Found existing agents: ${agents.map(a => a.name).join(', ')}`);
    }
    
    logger.info(`Detected stack: ${stack.language}${stack.framework ? ` with ${stack.framework}` : ''}`);
    
    // Get project template preference
    let template = options.template;
    if (!template) {
      const response = await prompts({
        type: 'select',
        name: 'template',
        message: 'What type of project is this?',
        choices: [
          { title: 'Web Application', value: 'web' },
          { title: 'Command Line Tool', value: 'cli' },
          { title: 'Library/Package', value: 'library' },
          { title: 'Full Stack Application', value: 'fullstack' },
          { title: 'Mobile Application', value: 'mobile' },
          { title: 'Custom', value: 'custom' }
        ],
        initial: stack.framework ? 0 : 1
      });
      
      template = response.template;
    }
    
    if (!template) {
      logger.error('Template selection is required');
      return;
    }
    
    // Generate project config
    const projectConfig: ProjectConfig = {
      name: getProjectName(cwd),
      stack,
      agents,
      preferences: {
        alwaysUseGit: true,
        alwaysWriteTests: true,
        testFramework: stack.testFramework || 'jest',
        commitStyle: 'conventional',
        runDevServer: true
      }
    };
    
    // Generate agents.md content
    const templateEngine = new TemplateEngine();
    const agentsContent = await templateEngine.generateAgentsFile(projectConfig, template);
    
    // Write agents.md
    const writeSpinner = ora('Creating agents.md...').start();
    await writeFile(agentsPath, agentsContent);
    writeSpinner.succeed('agents.md created successfully');
    
    logger.success('✨ Project initialized successfully!');
    logger.info('Next steps:');
    logger.info('  1. Review and customize agents.md');
    logger.info('  2. Run `agentinit sync` to apply configuration');
    logger.info('  3. Run `agentinit mcp --interactive` to install MCPs');
    
  } catch (error) {
    spinner.fail('Failed to analyze project');
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function getProjectName(cwd: string): string {
  try {
    const packageJsonPath = resolve(cwd, 'package.json');
    const packageJson = require(packageJsonPath);
    return packageJson.name || cwd.split('/').pop() || 'project';
  } catch {
    return cwd.split('/').pop() || 'project';
  }
}