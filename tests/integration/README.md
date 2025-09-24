# Integration Tests

This directory contains integration tests that require external dependencies or network access.

## Why Separate Integration Tests?

- **CI-Safe**: The main test suite (`npm test`) excludes these tests to avoid CI dependencies
- **Network Dependencies**: Some tests require access to npm/PyPI registries
- **Tool Dependencies**: Some tests require npx/bunx/pipx/uvx to be installed
- **Slower**: Integration tests are typically slower than unit tests

## Running Integration Tests

```bash
# Run only integration tests (requires tools to be installed)
npm run test:integration

# Run all tests (unit + integration)
npm run test:all

# Run only CI-safe unit tests (default)
npm test
```

## Test Categories

- **Unit Tests** (`tests/core/`, `tests/agents/`): Fast, no external dependencies, run in CI
- **Integration Tests** (`tests/integration/`): May require tools/network, excluded from CI

The goal is to keep CI fast and reliable while still allowing comprehensive local testing.