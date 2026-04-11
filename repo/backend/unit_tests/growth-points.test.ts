import { describe, it, expect } from 'vitest';

// Pure growth-points and tier-upgrade logic — no DB or HTTP dependencies.
// Mirrors the rules enforced in memberships/service.ts:
//   - 1 growth point per $1 of finalAmount (floor)
//   - Tier upgrade: member.growthPoints >= nextTier.pointsThreshold

const POINTS_PER_DOLLAR = 1;

function earnGrowthPoints(finalAmount: number): number {
  return Math.floor(finalAmount * POINTS_PER_DOLLAR);
}

function isEligibleForUpgrade(
  currentPoints: number,
  nextTierThreshold: number | null,
): boolean {
  if (nextTierThreshold === null) return false; // already at top tier
  return currentPoints >= nextTierThreshold;
}

describe('Growth points — earning', () => {
  it('$50.00 purchase earns 50 points', () => {
    expect(earnGrowthPoints(50)).toBe(50);
  });

  it('$0 purchase earns 0 points', () => {
    expect(earnGrowthPoints(0)).toBe(0);
  });

  it('$1 purchase earns 1 point', () => {
    expect(earnGrowthPoints(1)).toBe(1);
  });

  it('$0.99 purchase earns 0 points (floor, not round)', () => {
    expect(earnGrowthPoints(0.99)).toBe(0);
  });

  it('$50.75 purchase earns 50 points (fractional cents floored)', () => {
    expect(earnGrowthPoints(50.75)).toBe(50);
  });

  it('$100.00 purchase earns 100 points', () => {
    expect(earnGrowthPoints(100)).toBe(100);
  });

  it('large purchase earns proportional points', () => {
    expect(earnGrowthPoints(1250)).toBe(1250);
  });
});

describe('Growth points — tier upgrade eligibility', () => {
  it('member at threshold is eligible for upgrade', () => {
    expect(isEligibleForUpgrade(500, 500)).toBe(true);
  });

  it('member with more points than threshold is eligible', () => {
    expect(isEligibleForUpgrade(601, 500)).toBe(true);
  });

  it('member below threshold is not eligible', () => {
    expect(isEligibleForUpgrade(499, 500)).toBe(false);
  });

  it('member with 0 points, threshold 0 is eligible (base tier)', () => {
    expect(isEligibleForUpgrade(0, 0)).toBe(true);
  });

  it('null threshold (already at top tier) → never eligible', () => {
    expect(isEligibleForUpgrade(99999, null)).toBe(false);
  });

  it('null threshold with 0 points → still not eligible', () => {
    expect(isEligibleForUpgrade(0, null)).toBe(false);
  });
});

describe('Growth points — earning + upgrade combined scenario', () => {
  it('earning over time across multiple purchases eventually triggers upgrade', () => {
    const purchases = [20, 30, 50, 100, 100, 200]; // total $500
    const totalPoints = purchases.reduce((acc, amount) => acc + earnGrowthPoints(amount), 0);
    const goldThreshold = 500;
    expect(totalPoints).toBe(500);
    expect(isEligibleForUpgrade(totalPoints, goldThreshold)).toBe(true);
  });

  it('earning $1 short of threshold is not eligible', () => {
    const purchases = [20, 30, 50, 100, 100, 199]; // total $499
    const totalPoints = purchases.reduce((acc, amount) => acc + earnGrowthPoints(amount), 0);
    const goldThreshold = 500;
    expect(totalPoints).toBe(499);
    expect(isEligibleForUpgrade(totalPoints, goldThreshold)).toBe(false);
  });
});
