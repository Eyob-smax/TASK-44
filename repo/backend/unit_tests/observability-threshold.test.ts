import { describe, it, expect } from 'vitest';
import { evaluateThreshold, AlertOperator, LOG_RETENTION_DAYS } from '../src/modules/observability/types.js';

describe('LOG_RETENTION_DAYS', () => {
  it('is 30 days as required', () => {
    expect(LOG_RETENTION_DAYS).toBe(30);
  });
});

describe('evaluateThreshold', () => {
  describe('gt (greater than)', () => {
    it('returns true when value exceeds threshold', () => {
      expect(evaluateThreshold(501, AlertOperator.GT, 500)).toBe(true);
    });
    it('returns false when value equals threshold', () => {
      expect(evaluateThreshold(500, AlertOperator.GT, 500)).toBe(false);
    });
    it('returns false when value is below threshold', () => {
      expect(evaluateThreshold(499, AlertOperator.GT, 500)).toBe(false);
    });
  });

  describe('gte (greater than or equal)', () => {
    it('returns true when value equals threshold', () => {
      expect(evaluateThreshold(500, AlertOperator.GTE, 500)).toBe(true);
    });
    it('returns true when value exceeds threshold', () => {
      expect(evaluateThreshold(600, AlertOperator.GTE, 500)).toBe(true);
    });
    it('returns false when value is below threshold', () => {
      expect(evaluateThreshold(499, AlertOperator.GTE, 500)).toBe(false);
    });
  });

  describe('lt (less than)', () => {
    it('returns true when value is below threshold', () => {
      expect(evaluateThreshold(79, AlertOperator.LT, 80)).toBe(true);
    });
    it('returns false when value equals threshold', () => {
      expect(evaluateThreshold(80, AlertOperator.LT, 80)).toBe(false);
    });
    it('returns false when value exceeds threshold', () => {
      expect(evaluateThreshold(81, AlertOperator.LT, 80)).toBe(false);
    });
  });

  describe('lte (less than or equal)', () => {
    it('returns true when value equals threshold', () => {
      expect(evaluateThreshold(80, AlertOperator.LTE, 80)).toBe(true);
    });
    it('returns true when value is below threshold', () => {
      expect(evaluateThreshold(50, AlertOperator.LTE, 80)).toBe(true);
    });
    it('returns false when value exceeds threshold', () => {
      expect(evaluateThreshold(81, AlertOperator.LTE, 80)).toBe(false);
    });
  });

  describe('eq (equal)', () => {
    it('returns true when value equals threshold exactly', () => {
      expect(evaluateThreshold(42, AlertOperator.EQ, 42)).toBe(true);
    });
    it('returns false when value differs', () => {
      expect(evaluateThreshold(43, AlertOperator.EQ, 42)).toBe(false);
    });
  });
});
