import type { MarketplaceRegistry } from '../types/plugins.js';
import { readUserConfigSync } from './userConfig.js';

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

const CUSTOM_MARKETPLACE_PLUGIN_DIRS = ['skills', 'mcps', 'rules'];
const CUSTOM_MARKETPLACE_CACHE_TTL_MS = 3600000;

function getCustomMarketplaces(): MarketplaceRegistry[] {
  const builtInIds = new Set(MARKETPLACES.map(marketplace => marketplace.id));
  return readUserConfigSync().customMarketplaces
    .filter(marketplace => !builtInIds.has(marketplace.identifier))
    .map(marketplace => ({
      id: marketplace.identifier,
      name: marketplace.name,
      repoUrl: marketplace.repoUrl,
      pluginDirs: [...CUSTOM_MARKETPLACE_PLUGIN_DIRS],
      cacheTtlMs: CUSTOM_MARKETPLACE_CACHE_TTL_MS,
    }));
}

function getAllMarketplaces(): MarketplaceRegistry[] {
  return [...MARKETPLACES, ...getCustomMarketplaces()];
}

export function getMarketplace(id: string): MarketplaceRegistry | undefined {
  return getAllMarketplaces().find(marketplace => marketplace.id === id);
}

export function getMarketplaceIds(): string[] {
  return getAllMarketplaces().map(marketplace => marketplace.id);
}

export function getConfiguredDefaultMarketplaceId(): string | undefined {
  const defaultMarketplace = readUserConfigSync().defaultMarketplace;
  if (!defaultMarketplace) {
    return undefined;
  }

  return getMarketplace(defaultMarketplace)?.id;
}
