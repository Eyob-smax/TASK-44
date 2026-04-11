import { describe, it, expect } from 'vitest';

// Pure SLA deadline logic — no DB or HTTP dependencies.
// Mirrors after-sales/service.ts SLA rules:
//   urgent → 4 h, high → 8 h, medium → 24 h, low → 72 h

const SLA_HOURS: Record<string, number> = {
  urgent: 4,
  high: 8,
  medium: 24,
  low: 72,
};

function calculateSlaDeadline(createdAt: Date, priority: string): Date {
  const hours = SLA_HOURS[priority];
  if (hours === undefined) throw new Error(`Unknown priority: ${priority}`);
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

function isSlaBreached(slaDeadlineAt: Date | null, now: Date = new Date()): boolean {
  if (!slaDeadlineAt) return false;
  return slaDeadlineAt < now;
}

function isSlaApproaching(
  slaDeadlineAt: Date | null,
  withinHours = 4,
  now: Date = new Date(),
): boolean {
  if (!slaDeadlineAt) return false;
  if (isSlaBreached(slaDeadlineAt, now)) return false;
  const windowMs = withinHours * 60 * 60 * 1000;
  return slaDeadlineAt.getTime() - now.getTime() <= windowMs;
}

const BASE = new Date('2026-01-01T00:00:00Z');

describe('calculateSlaDeadline — priority mapping', () => {
  it('urgent → deadline is 4 hours after creation', () => {
    const deadline = calculateSlaDeadline(BASE, 'urgent');
    expect(deadline.getTime()).toBe(BASE.getTime() + 4 * 60 * 60 * 1000);
  });

  it('high → deadline is 8 hours after creation', () => {
    const deadline = calculateSlaDeadline(BASE, 'high');
    expect(deadline.getTime()).toBe(BASE.getTime() + 8 * 60 * 60 * 1000);
  });

  it('medium → deadline is 24 hours after creation', () => {
    const deadline = calculateSlaDeadline(BASE, 'medium');
    expect(deadline.getTime()).toBe(BASE.getTime() + 24 * 60 * 60 * 1000);
  });

  it('low → deadline is 72 hours (3 days) after creation', () => {
    const deadline = calculateSlaDeadline(BASE, 'low');
    expect(deadline.getTime()).toBe(BASE.getTime() + 72 * 60 * 60 * 1000);
  });

  it('unknown priority → throws', () => {
    expect(() => calculateSlaDeadline(BASE, 'critical')).toThrow('Unknown priority: critical');
  });

  it('deadline is always in the future relative to createdAt', () => {
    for (const priority of ['urgent', 'high', 'medium', 'low']) {
      const deadline = calculateSlaDeadline(BASE, priority);
      expect(deadline.getTime()).toBeGreaterThan(BASE.getTime());
    }
  });

  it('urgent deadline is earlier than low deadline', () => {
    const urgentDeadline = calculateSlaDeadline(BASE, 'urgent');
    const lowDeadline = calculateSlaDeadline(BASE, 'low');
    expect(urgentDeadline.getTime()).toBeLessThan(lowDeadline.getTime());
  });
});

describe('isSlaBreached', () => {
  it('returns true when deadline is in the past', () => {
    const past = new Date(Date.now() - 1000);
    expect(isSlaBreached(past)).toBe(true);
  });

  it('returns false when deadline is in the future', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(isSlaBreached(future)).toBe(false);
  });

  it('returns false when slaDeadlineAt is null (no SLA set)', () => {
    expect(isSlaBreached(null)).toBe(false);
  });

  it('uses supplied now for deterministic tests', () => {
    const now = new Date('2026-01-05T12:00:00Z');
    const past = new Date('2026-01-05T11:59:59Z');
    const future = new Date('2026-01-05T12:00:01Z');
    expect(isSlaBreached(past, now)).toBe(true);
    expect(isSlaBreached(future, now)).toBe(false);
  });
});

describe('isSlaApproaching', () => {
  it('returns true when deadline is within 4 hours from now', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const nearFuture = new Date('2026-01-01T12:00:00Z'); // 2 hours from now
    expect(isSlaApproaching(nearFuture, 4, now)).toBe(true);
  });

  it('returns false when deadline is more than 4 hours away', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const farFuture = new Date('2026-01-01T20:00:00Z'); // 10 hours from now
    expect(isSlaApproaching(farFuture, 4, now)).toBe(false);
  });

  it('returns false when deadline is already breached (past)', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const past = new Date('2026-01-01T09:00:00Z');
    expect(isSlaApproaching(past, 4, now)).toBe(false);
  });

  it('returns false when deadline is null', () => {
    expect(isSlaApproaching(null)).toBe(false);
  });

  it('exactly at window boundary (within = deadline exactly now + withinHours) → approaching', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const exactBoundary = new Date('2026-01-01T14:00:00Z'); // exactly 4h from now
    expect(isSlaApproaching(exactBoundary, 4, now)).toBe(true);
  });

  it('custom withinHours=1: approaching if deadline within 1 hour', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const in45min = new Date('2026-01-01T10:45:00Z');
    const in90min = new Date('2026-01-01T11:30:00Z');
    expect(isSlaApproaching(in45min, 1, now)).toBe(true);
    expect(isSlaApproaching(in90min, 1, now)).toBe(false);
  });
});
