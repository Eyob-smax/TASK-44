import { describe, it, expect } from 'vitest';
import {
  remainingCompensationBudget,
  capCompensation,
  DEFAULT_COMPENSATION_CAP,
} from '../src/modules/after-sales/types.js';

describe('remainingCompensationBudget', () => {
  it('returns full cap when nothing has been approved', () => {
    expect(remainingCompensationBudget(0, 50)).toBe(50);
  });

  it('returns remaining budget after partial approval', () => {
    expect(remainingCompensationBudget(30, 50)).toBe(20);
  });

  it('returns zero when cap is exactly reached', () => {
    expect(remainingCompensationBudget(50, 50)).toBe(0);
  });

  it('returns zero (never negative) when approved exceeds cap', () => {
    expect(remainingCompensationBudget(55, 50)).toBe(0);
  });

  it('uses DEFAULT_COMPENSATION_CAP when no cap provided', () => {
    const result = remainingCompensationBudget(10);
    expect(result).toBe(DEFAULT_COMPENSATION_CAP - 10);
  });

  it('returns 2-decimal precision', () => {
    expect(remainingCompensationBudget(10.005, 50)).toBe(39.99);
  });
});

describe('capCompensation', () => {
  it('returns suggested amount when it is within remaining budget', () => {
    expect(capCompensation(30, 0, 50)).toBe(30);
  });

  it('caps to remaining budget when suggestion exceeds it', () => {
    // approved=25, cap=50, remaining=25; suggestion=30 → capped to 25
    expect(capCompensation(30, 25, 50)).toBe(25);
  });

  it('caps to cap value when no previous approvals', () => {
    expect(capCompensation(100, 0, 50)).toBe(50);
  });

  it('returns 0 when budget is fully consumed', () => {
    expect(capCompensation(20, 50, 50)).toBe(0);
  });

  it('uses DEFAULT_COMPENSATION_CAP when no cap provided', () => {
    const result = capCompensation(10, 0);
    expect(result).toBe(Math.min(10, DEFAULT_COMPENSATION_CAP));
  });

  it('returns 2-decimal precision', () => {
    expect(capCompensation(10.005, 0, 50)).toBe(10.01);
  });
});

describe('DEFAULT_COMPENSATION_CAP', () => {
  it('is set to $50.00', () => {
    expect(DEFAULT_COMPENSATION_CAP).toBe(50.0);
  });
});
