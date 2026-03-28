import { describe, it, expect } from 'vitest';
import { RulesTemplateLoader } from '../../src/core/rulesTemplateLoader.js';

describe('RulesTemplateLoader', () => {
  it('should load bundled rule templates in the source tree', () => {
    const loader = new RulesTemplateLoader();

    expect(loader.getAvailableTemplateIds()).toContain('git');
    expect(loader.getTemplate('write_tests')?.name).toBe('Write Tests');
  });
});
