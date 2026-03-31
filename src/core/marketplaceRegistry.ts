import type { MarketplaceRegistry } from '../types/plugins.js';

export const MARKETPLACES: MarketplaceRegistry[] = [
  {
    id: 'agentinit',
    name: 'AgentInit Marketplace',
    repoUrl: 'https://github.com/agentinit/marketplace.git',
    pluginDirs: ['skills', 'mcps', 'rules'],
    cacheTtlMs: 3600000,
  },
  {
    id: 'claude',
    name: 'Claude Plugins Official',
    repoUrl: 'https://github.com/anthropics/claude-plugins-official.git',
    pluginDirs: ['plugins', 'external_plugins'],
    cacheTtlMs: 3600000,
  },
  {
    id: 'openai',
    name: 'OpenAI Skills',
    repoUrl: 'https://github.com/openai/skills.git',
    pluginDirs: ['skills/.curated', 'skills/.system', 'skills/.experimental'],
    cacheTtlMs: 3600000,
  },
];

export function getMarketplace(id: string): MarketplaceRegistry | undefined {
  return MARKETPLACES.find(marketplace => marketplace.id === id);
}

export function getMarketplaceIds(): string[] {
  return MARKETPLACES.map(marketplace => marketplace.id);
}
