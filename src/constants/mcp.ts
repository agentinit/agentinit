import { getOwnPackageVersion } from '../utils/ownPackageVersion.js';

export const DEFAULT_CONNECTION_TIMEOUT_MS = 30000;

// Maximum size for resource content fetching (10MB)
export const MAX_RESOURCE_CONTENT_SIZE = 10 * 1024 * 1024;

export const MCP_VERIFIER_CONFIG = {
  name: "agentinit-verifier",
  version: getOwnPackageVersion()
} as const;

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
