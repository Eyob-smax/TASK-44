import { describe, it, expect } from 'vitest';
import {
  capCompensation,
  remainingCompensationBudget,
  DEFAULT_COMPENSATION_CAP,
} from '../src/modules/after-sales/types.js';

describe('DEFAULT_COMPENSATION_CAP', () => {
  it('is $50.00', () => {
    expect(DEFAULT_COMPENSATION_CAP).toBe(50.0);
  });
});

describe('remainingCompensationBudget', () => {
  it('returns full cap when nothing has been approved', () => {
    expect(remainingCompensationBudget(0)).toBe(50.0);
  });

  it('returns zero when approved total equals the cap', () => {
    expect(remainingCompensationBudget(50.0)).toBe(0);
  });

  it('returns zero when approved total exceeds the cap (never negative)', () => {
    expect(remainingCompensationBudget(60.0)).toBe(0);
  });

  it('returns correct remainder for partial approved amounts', () => {
    expect(remainingCompensationBudget(10.0)).toBe(40.0);
    expect(remainingCompensationBudget(25.0)).toBe(25.0);
    expect(remainingCompensationBudget(49.99)).toBeCloseTo(0.01, 2);
  });

  it('respects a custom cap', () => {
    expect(remainingCompensationBudget(10.0, 30.0)).toBe(20.0);
  });
});

describe('capCompensation', () => {
  it('returns suggested amount when it is below remaining budget', () => {
    // $10 suggested, $0 already approved, $50 cap → returns $10
    expect(capCompensation(10.0, 0)).toBe(10.0);
  });

  it('caps suggested amount to remaining budget', () => {
    // $20 suggested, $40 already approved, $10 remaining → returns $10
    expect(capCompensation(20.0, 40.0)).toBe(10.0);
  });

  it('returns zero when cap is fully exhausted', () => {
    expect(capCompensation(10.0, 50.0)).toBe(0);
  });

  it('returns zero when cap is already exceeded', () => {
    expect(capCompensation(10.0, 60.0)).toBe(0);
  });

  it('returns suggested amount exactly at the cap boundary', () => {
    // Suggest $50 with nothing approved → returns $50 exactly
    expect(capCompensation(50.0, 0)).toBe(50.0);
  });

  it('caps a suggestion to the exact remaining amount (penny precision)', () => {
    // $10 suggested, $49.99 approved, $0.01 remaining → returns $0.01
    expect(capCompensation(10.0, 49.99)).toBeCloseTo(0.01, 2);
  });

  it('accumulates multiple suggestions correctly through remaining budget', () => {
    // First suggestion: $10, approved total 0 → allowed $10
    const first = capCompensation(10.0, 0);
    expect(first).toBe(10.0);

    // Second suggestion: $20, approved total $10 → allowed $20
    const second = capCompensation(20.0, first);
    expect(second).toBe(20.0);

    // Third suggestion: $30, approved total $30 → allowed $20 (cap remaining)
    const third = capCompensation(30.0, first + second);
    expect(third).toBe(20.0);

    // Fourth suggestion: any amount, cap exhausted → $0
    const fourth = capCompensation(5.0, first + second + third);
    expect(fourth).toBe(0);
  });

  it('respects a custom cap', () => {
    expect(capCompensation(20.0, 0, 15.0)).toBe(15.0);
  });
});
