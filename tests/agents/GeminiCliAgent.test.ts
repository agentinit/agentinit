import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { GeminiCliAgent } from '../../src/agents/GeminiCliAgent.js';

describe('GeminiCliAgent', () => {
  const agent = new GeminiCliAgent();
  const testProjectPath = '/test/project';

  it('should expose rules paths through the agent definition', () => {
    expect(agent.getProjectRulesPath(testProjectPath)).toBe(resolve(testProjectPath, '.gemini/settings.json'));
    expect(agent.getGlobalRulesPath()).toContain('.gemini/settings.json');
  });

  it('should replace the rules object while preserving other settings', async () => {
    const updated = await agent.applyRulesConfig('/tmp/.gemini/settings.json', {
      templateRules: ['Prefer typed APIs'],
      rawRules: [],
      fileRules: [],
      remoteRules: [],
      merged: ['Prefer typed APIs'],
      sections: [
        {
          templateId: 'custom_rules',
          templateName: 'Custom Rules',
          rules: ['Prefer typed APIs']
        }
      ]
    }, JSON.stringify({
      theme: 'dark',
      mcpServers: {
        exa: {
          command: 'npx'
        }
      },
      rules: {
        git: {
          name: 'Git',
          rules: ['Commit often']
        }
      }
    }, null, 2));

    const parsed = JSON.parse(updated);
    expect(parsed.theme).toBe('dark');
    expect(parsed.mcpServers.exa.command).toBe('npx');
    expect(parsed.rules).toEqual({
      custom_rules: {
        name: 'Custom Rules',
        rules: ['Prefer typed APIs']
      }
    });
  });
});
