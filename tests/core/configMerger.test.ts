import { ConfigMerger } from '../../src/core/configMerger.js';

describe('ConfigMerger', () => {
  describe('mergeJSON', () => {
    it('should merge simple objects', () => {
      const existing = { a: 1, b: 2 };
      const newData = { c: 3, d: 4 };
      
      const result = ConfigMerger.mergeJSON(existing, newData);
      
      expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('should override primitive values', () => {
      const existing = { a: 1, b: 2 };
      const newData = { a: 10, c: 3 };
      
      const result = ConfigMerger.mergeJSON(existing, newData);
      
      expect(result).toEqual({ a: 10, b: 2, c: 3 });
    });

    it('should deep merge nested objects', () => {
      const existing = {
        servers: { server1: { command: 'old' } },
        other: { setting: 'keep' }
      };
      const newData = {
        servers: { server2: { command: 'new' } },
        other: { newSetting: 'add' }
      };
      
      const result = ConfigMerger.mergeJSON(existing, newData);
      
      expect(result).toEqual({
        servers: {
          server1: { command: 'old' },
          server2: { command: 'new' }
        },
        other: {
          setting: 'keep',
          newSetting: 'add'
        }
      });
    });

    it('should replace arrays entirely', () => {
      const existing = { items: [1, 2, 3] };
      const newData = { items: [4, 5] };
      
      const result = ConfigMerger.mergeJSON(existing, newData);
      
      expect(result).toEqual({ items: [4, 5] });
    });

    it('should handle null and undefined values', () => {
      const existing = { a: 1, b: 2, c: 3 };
      const newData = { a: null, b: undefined, d: 4 };
      
      const result = ConfigMerger.mergeJSON(existing, newData);
      
      expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('should return newData when existing is null/undefined', () => {
      const newData = { a: 1, b: 2 };
      
      expect(ConfigMerger.mergeJSON(null, newData)).toEqual(newData);
      expect(ConfigMerger.mergeJSON(undefined, newData)).toEqual(newData);
    });

    it('should return existing when newData is null/undefined', () => {
      const existing = { a: 1, b: 2 };
      
      expect(ConfigMerger.mergeJSON(existing, null)).toEqual(existing);
      expect(ConfigMerger.mergeJSON(existing, undefined)).toEqual(existing);
    });
  });

  describe('mergeTOML', () => {
    it('should merge TOML configurations', () => {
      const existingToml = `
[servers.server1]
command = "old"
args = ["--old"]
`;
      const newData = {
        servers: {
          server2: { command: "new", args: ["--new"] }
        }
      };
      
      const result = ConfigMerger.mergeTOML(existingToml, newData);
      
      expect(result).toContain('[servers.server1]');
      expect(result).toContain('[servers.server2]');
      expect(result).toContain('command = "old"');
      expect(result).toContain('command = "new"');
    });

    it('should handle invalid TOML gracefully', () => {
      const invalidToml = 'invalid toml content [[[';
      const newData = { test: 'value' };
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = ConfigMerger.mergeTOML(invalidToml, newData);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Existing TOML configuration is invalid, starting fresh'
      );
      expect(result).toContain('test = "value"');
      
      consoleSpy.mockRestore();
    });

    it('should handle empty TOML', () => {
      const emptyToml = '';
      const newData = { test: 'value' };
      
      const result = ConfigMerger.mergeTOML(emptyToml, newData);
      
      expect(result).toContain('test = "value"');
    });
  });

  describe('parseJSON', () => {
    it('should parse valid JSON', () => {
      const jsonString = '{"a": 1, "b": 2}';
      
      const result = ConfigMerger.parseJSON(jsonString);
      
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should return fallback for invalid JSON', () => {
      const invalidJson = 'invalid json {{{';
      const fallback = { default: true };
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = ConfigMerger.parseJSON(invalidJson, fallback);
      
      expect(result).toEqual(fallback);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Invalid JSON, using fallback value'
      );
      
      consoleSpy.mockRestore();
    });

    it('should return fallback for empty string', () => {
      const fallback = { default: true };
      
      const result = ConfigMerger.parseJSON('', fallback);
      
      expect(result).toEqual(fallback);
    });
  });

  describe('parseTOML', () => {
    it('should parse valid TOML', () => {
      const tomlString = 'test = "value"\nnum = 42';
      
      const result = ConfigMerger.parseTOML(tomlString);
      
      expect(result).toEqual({ test: 'value', num: 42 });
    });

    it('should return fallback for invalid TOML', () => {
      const invalidToml = 'invalid toml [[[';
      const fallback = { default: true };
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = ConfigMerger.parseTOML(invalidToml, fallback);
      
      expect(result).toEqual(fallback);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('formatJSON', () => {
    it('should format JSON with proper indentation', () => {
      const data = { a: 1, b: { c: 2 } };
      
      const result = ConfigMerger.formatJSON(data);
      
      expect(result).toBe('{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}');
    });
  });

  describe('formatTOML', () => {
    it('should format TOML with header', () => {
      const data = { test: 'value' };
      const options = { header: 'Test Configuration' };
      
      const result = ConfigMerger.formatTOML(data, options);
      
      expect(result).toContain('# Test Configuration');
      expect(result).toContain('# Generated automatically by agentinit');
      expect(result).toContain('test = "value"');
    });

    it('should format TOML with section separators', () => {
      const data = {
        section1: { value: 'test1' },
        section2: { value: 'test2' }
      };
      const options = { sectionSeparator: true };
      
      const result = ConfigMerger.formatTOML(data, options);
      
      // Should contain both sections
      expect(result).toContain('[section1]');
      expect(result).toContain('[section2]');
      expect(result).toContain('value = "test1"');
      expect(result).toContain('value = "test2"');
    });
  });

  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(ConfigMerger.deepClone(42)).toBe(42);
      expect(ConfigMerger.deepClone('test')).toBe('test');
      expect(ConfigMerger.deepClone(true)).toBe(true);
      expect(ConfigMerger.deepClone(null)).toBe(null);
    });

    it('should clone dates', () => {
      const date = new Date('2023-01-01');
      const cloned = ConfigMerger.deepClone(date);
      
      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });

    it('should clone arrays', () => {
      const array = [1, { a: 2 }, [3, 4]];
      const cloned = ConfigMerger.deepClone(array);
      
      expect(cloned).toEqual(array);
      expect(cloned).not.toBe(array);
      expect(cloned[1]).not.toBe(array[1]);
      expect(cloned[2]).not.toBe(array[2]);
    });

    it('should clone objects deeply', () => {
      const obj = {
        a: 1,
        b: { c: 2, d: { e: 3 } },
        f: [4, 5, { g: 6 }]
      };
      const cloned = ConfigMerger.deepClone(obj);
      
      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
      expect(cloned.b.d).not.toBe(obj.b.d);
      expect(cloned.f).not.toBe(obj.f);
      expect(cloned.f[2]).not.toBe(obj.f[2]);
    });
  });

  describe('mergeArrays', () => {
    it('should merge arrays without key field (simple deduplication)', () => {
      const existing = [1, 2, 3];
      const newItems = [3, 4, 5];
      
      const result = ConfigMerger.mergeArrays(existing, newItems);
      
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should merge arrays with key field', () => {
      const existing = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' }
      ];
      const newItems = [
        { id: 2, name: 'b-updated' }, // Should not be added (duplicate ID)
        { id: 3, name: 'c' }
      ];
      
      const result = ConfigMerger.mergeArrays(existing, newItems, 'id');
      
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ id: 1, name: 'a' });
      expect(result).toContainEqual({ id: 2, name: 'b' }); // Original kept
      expect(result).toContainEqual({ id: 3, name: 'c' });
    });

    it('should handle non-array inputs gracefully', () => {
      const existing = null as any;
      const newItems = [1, 2, 3];
      
      const result = ConfigMerger.mergeArrays(existing, newItems);
      
      expect(result).toEqual([1, 2, 3]);
    });
  });
});