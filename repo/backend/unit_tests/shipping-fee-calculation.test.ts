import { describe, it, expect } from 'vitest';
import { calculateShippingFee } from '../src/modules/logistics/types.js';

const baseTemplate = {
  id: 'tpl-1',
  baseFee: 6.95,
  baseWeightLb: 2.0,
  perAdditionalLbFee: 1.25,
};

describe('calculateShippingFee', () => {
  it('returns baseFee when weight is at or below base weight (no overage)', () => {
    const result = calculateShippingFee(baseTemplate, [], 2.0, []);
    expect(result.baseFee).toBe(6.95);
    expect(result.additionalWeightFee).toBe(0);
    expect(result.surchargeTotal).toBe(0);
    expect(result.totalFee).toBe(6.95);
  });

  it('calculates additional weight fee for overage', () => {
    // 4.0 lb total — 2.0 lb overage × $1.25 = $2.50
    const result = calculateShippingFee(baseTemplate, [], 4.0, []);
    expect(result.additionalWeightFee).toBe(2.5);
    expect(result.totalFee).toBe(6.95 + 2.5);
  });

  it('rounds additional weight fee to 2 decimal places', () => {
    // 2.1 lb total — 0.1 lb overage × $1.25 = $0.125 → $0.13 (rounded)
    const result = calculateShippingFee(baseTemplate, [], 2.1, []);
    expect(result.additionalWeightFee).toBe(0.13);
  });

  it('weight below base weight has zero overage', () => {
    const result = calculateShippingFee(baseTemplate, [], 1.0, []);
    expect(result.additionalWeightFee).toBe(0);
    expect(result.totalFee).toBe(6.95);
  });

  it('adds applicable surcharges', () => {
    const surcharges = [
      { condition: 'alaska_hawaii', surchargeAmount: 5.0 },
      { condition: 'oversize', surchargeAmount: 10.0 },
    ];
    const result = calculateShippingFee(baseTemplate, surcharges, 2.0, ['alaska_hawaii']);
    expect(result.surchargeTotal).toBe(5.0);
    expect(result.totalFee).toBe(6.95 + 5.0);
  });

  it('does not apply non-matching surcharge conditions', () => {
    const surcharges = [
      { condition: 'alaska_hawaii', surchargeAmount: 5.0 },
    ];
    const result = calculateShippingFee(baseTemplate, surcharges, 2.0, ['hazmat']); // different condition
    expect(result.surchargeTotal).toBe(0);
    expect(result.totalFee).toBe(6.95);
  });

  it('applies multiple surcharges when all conditions match', () => {
    const surcharges = [
      { condition: 'alaska_hawaii', surchargeAmount: 5.0 },
      { condition: 'oversize', surchargeAmount: 10.0 },
    ];
    const result = calculateShippingFee(baseTemplate, surcharges, 2.0, ['alaska_hawaii', 'oversize']);
    expect(result.surchargeTotal).toBe(15.0);
    expect(result.totalFee).toBe(6.95 + 15.0);
  });

  it('breakdown includes base fee label', () => {
    const result = calculateShippingFee(baseTemplate, [], 2.0, []);
    expect(result.breakdown[0].label).toBe('Base fee');
    expect(result.breakdown[0].amount).toBe(6.95);
  });

  it('breakdown includes additional weight label when overage exists', () => {
    const result = calculateShippingFee(baseTemplate, [], 4.0, []);
    expect(result.breakdown.length).toBeGreaterThan(1);
    expect(result.breakdown.some((b) => b.label.includes('Additional weight'))).toBe(true);
  });

  it('templateId is returned correctly', () => {
    const result = calculateShippingFee(baseTemplate, [], 2.0, []);
    expect(result.templateId).toBe('tpl-1');
  });
});
