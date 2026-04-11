import { describe, it, expect } from 'vitest';
import {
  isEscalationEligible,
  ESCALATION_THRESHOLD_MS,
  ParkingExceptionStatus,
} from '../src/modules/parking/types.js';

describe('ESCALATION_THRESHOLD_MS', () => {
  it('is exactly 15 minutes in milliseconds', () => {
    expect(ESCALATION_THRESHOLD_MS).toBe(15 * 60 * 1000);
  });
});

describe('isEscalationEligible', () => {
  const now = new Date('2026-04-10T10:00:00Z');

  it('returns true for an open exception older than 15 minutes', () => {
    const createdAt = new Date('2026-04-10T09:44:00Z'); // 16 minutes ago
    expect(
      isEscalationEligible({ status: ParkingExceptionStatus.OPEN, createdAt }, now)
    ).toBe(true);
  });

  it('returns true for an open exception exactly at the 15-minute threshold', () => {
    const createdAt = new Date('2026-04-10T09:45:00Z'); // exactly 15 minutes ago
    expect(
      isEscalationEligible({ status: ParkingExceptionStatus.OPEN, createdAt }, now)
    ).toBe(true);
  });

  it('returns false for an open exception under 15 minutes old', () => {
    const createdAt = new Date('2026-04-10T09:46:00Z'); // 14 minutes ago
    expect(
      isEscalationEligible({ status: ParkingExceptionStatus.OPEN, createdAt }, now)
    ).toBe(false);
  });

  it('returns false for an open exception created just now', () => {
    expect(
      isEscalationEligible({ status: ParkingExceptionStatus.OPEN, createdAt: now }, now)
    ).toBe(false);
  });

  it('returns false for an already escalated exception older than 15 minutes', () => {
    const createdAt = new Date('2026-04-10T09:00:00Z'); // 1 hour ago
    expect(
      isEscalationEligible({ status: ParkingExceptionStatus.ESCALATED, createdAt }, now)
    ).toBe(false);
  });

  it('returns false for a resolved exception older than 15 minutes', () => {
    const createdAt = new Date('2026-04-10T09:00:00Z');
    expect(
      isEscalationEligible({ status: ParkingExceptionStatus.RESOLVED, createdAt }, now)
    ).toBe(false);
  });

  it('uses current time by default when no "now" is provided', () => {
    const oldException = {
      status: ParkingExceptionStatus.OPEN,
      createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
    };
    expect(isEscalationEligible(oldException)).toBe(true);
  });

  it('returns false for a newly created exception by default when no "now" is provided', () => {
    const newException = {
      status: ParkingExceptionStatus.OPEN,
      createdAt: new Date(),
    };
    expect(isEscalationEligible(newException)).toBe(false);
  });

  it('handles boundary: 14 minutes 59 seconds → not eligible', () => {
    const almostThreshold = new Date(now.getTime() - (15 * 60 * 1000 - 1000));
    expect(
      isEscalationEligible({ status: ParkingExceptionStatus.OPEN, createdAt: almostThreshold }, now)
    ).toBe(false);
  });
});
