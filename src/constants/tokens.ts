export const TOKEN_COUNT_THRESHOLDS = {
  LOW: 5000,
  MEDIUM: 15000
} as const;

export type TokenCountThreshold = typeof TOKEN_COUNT_THRESHOLDS[keyof typeof TOKEN_COUNT_THRESHOLDS];