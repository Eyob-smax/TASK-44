import { describe, it, expect } from 'vitest';
import { isEscalationEligible, ParkingExceptionStatus, ESCALATION_THRESHOLD_MS } from '../src/modules/parking/types.js';

describe('isEscalationEligible', () => {
  const STATUS = ParkingExceptionStatus;

  it('returns false when exception created less than 15 minutes ago', () => {
    const createdAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    expect(isEscalationEligible({ status: STATUS.OPEN, createdAt })).toBe(false);
  });

  it('returns true when exception is open and created more than 15 minutes ago', () => {
    const createdAt = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
    expect(isEscalationEligible({ status: STATUS.OPEN, createdAt })).toBe(true);
  });

  it('returns false when exception is already escalated', () => {
    const createdAt = new Date(Date.now() - 30 * 60 * 1000);
    expect(isEscalationEligible({ status: STATUS.ESCALATED, createdAt })).toBe(false);
  });

  it('returns false when exception is resolved', () => {
    const createdAt = new Date(Date.now() - 30 * 60 * 1000);
    expect(isEscalationEligible({ status: STATUS.RESOLVED, createdAt })).toBe(false);
  });

  it('returns false exactly at the threshold boundary (not yet eligible)', () => {
    const createdAt = new Date(Date.now() - ESCALATION_THRESHOLD_MS + 100); // just under threshold
    expect(isEscalationEligible({ status: STATUS.OPEN, createdAt })).toBe(false);
  });

  it('returns true when exactly at threshold', () => {
    const createdAt = new Date(Date.now() - ESCALATION_THRESHOLD_MS);
    expect(isEscalationEligible({ status: STATUS.OPEN, createdAt })).toBe(true);
  });

  it('supports a custom now parameter', () => {
    const createdAt = new Date('2024-01-01T10:00:00Z');
    const now = new Date('2024-01-01T10:20:00Z'); // 20 min later
    expect(isEscalationEligible({ status: STATUS.OPEN, createdAt }, now)).toBe(true);
  });
});

describe('Exception threshold constant', () => {
  it('ESCALATION_THRESHOLD_MS equals 15 minutes in milliseconds', () => {
    expect(ESCALATION_THRESHOLD_MS).toBe(15 * 60 * 1000);
  });
});
