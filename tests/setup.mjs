// Test setup file for Jest
// This file is run before all tests

import { jest } from '@jest/globals';

// Mock contextcalc module using ESM approach
jest.unstable_mockModule('contextcalc', async () => {
  const mockModule = await import('./__mocks__/contextcalc.js');
  return mockModule;
});

// Global test setup if needed
global.console = {
  ...console,
  // uncomment to ignore a specific log level
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  warn: jest.fn(),
  // error: jest.fn(),
};