export const DEFAULT_CONNECTION_TIMEOUT_MS = 30000;

export const MCP_VERIFIER_CONFIG = {
  name: "agentinit-verifier",
  version: "1.0.0"
} as const;

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}