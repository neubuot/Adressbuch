import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/utils/dom';

describe('DOM Utils', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("XSS")</script>'))
        .toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
    });

    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle normal text without changes', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should escape quotes', () => {
      expect(escapeHtml('"Hello"')).toBe('"Hello"');
    });
  });
});
