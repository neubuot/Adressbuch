/**
 * Unit-Tests für Hash-Utilities
 */

import { describe, it, expect } from 'vitest';
import { stableHash, stableStringify } from './hash';

describe('Hash Utilities', () => {
  describe('stableStringify', () => {
    it('sollte Objekte deterministisch serialisieren', () => {
      const obj1 = { b: 2, a: 1, c: 3 };
      const obj2 = { a: 1, c: 3, b: 2 };

      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
    });

    it('sollte verschachtelte Objekte korrekt serialisieren', () => {
      const obj1 = { outer: { b: 2, a: 1 } };
      const obj2 = { outer: { a: 1, b: 2 } };

      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
    });

    it('sollte Arrays korrekt serialisieren', () => {
      const obj = { arr: [1, 2, 3], str: 'test' };
      const result = stableStringify(obj);

      expect(result).toContain('[1,2,3]');
    });

    it('sollte null und undefined korrekt behandeln', () => {
      expect(stableStringify(null)).toBe('null');
      expect(stableStringify(undefined)).toBe('undefined');
    });
  });

  describe('stableHash', () => {
    it('sollte identische Hashes für identische Objekte erzeugen', () => {
      const obj1 = { firstName: 'Max', lastName: 'Mustermann' };
      const obj2 = { firstName: 'Max', lastName: 'Mustermann' };

      expect(stableHash(obj1)).toBe(stableHash(obj2));
    });

    it('sollte identische Hashes für unterschiedlich geordnete Objekte erzeugen', () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };

      expect(stableHash(obj1)).toBe(stableHash(obj2));
    });

    it('sollte unterschiedliche Hashes für unterschiedliche Objekte erzeugen', () => {
      const obj1 = { firstName: 'Max' };
      const obj2 = { firstName: 'Maria' };

      expect(stableHash(obj1)).not.toBe(stableHash(obj2));
    });

    it('sollte einen 8-stelligen Hex-String zurückgeben', () => {
      const obj = { test: 'value' };
      const hash = stableHash(obj);

      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });
});
