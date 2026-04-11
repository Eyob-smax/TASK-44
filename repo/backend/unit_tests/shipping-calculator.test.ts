import { describe, it, expect } from 'vitest';
import {
  calculateShippingFee,
  ShippingTier,
  type ShippingFeeTemplate,
  type ShippingFeeSurcharge,
} from '../src/modules/logistics/types.js';

const baseTemplate: Pick<ShippingFeeTemplate, 'id' | 'baseFee' | 'baseWeightLb' | 'perAdditionalLbFee'> = {
  id: 'template-1',
  baseFee: 6.95,
  baseWeightLb: 2.0,
  perAdditionalLbFee: 1.25,
};

const alaskaHawaiiSurcharge: Pick<ShippingFeeSurcharge, 'condition' | 'surchargeAmount'> = {
  condition: 'alaska_hawaii',
  surchargeAmount: 5.00,
};

const oversizeSurcharge: Pick<ShippingFeeSurcharge, 'condition' | 'surchargeAmount'> = {
  condition: 'oversize',
  surchargeAmount: 15.00,
};

describe('calculateShippingFee', () => {
  it('returns base fee only when weight is exactly at base weight', () => {
    const result = calculateShippingFee(baseTemplate, [], 2.0, []);
    expect(result.baseFee).toBe(6.95);
    expect(result.additionalWeightFee).toBe(0);
    expect(result.surchargeTotal).toBe(0);
    expect(result.totalFee).toBe(6.95);
    expect(result.templateId).toBe('template-1');
  });

  it('returns base fee only when weight is under base weight', () => {
    const result = calculateShippingFee(baseTemplate, [], 1.0, []);
    expect(result.additionalWeightFee).toBe(0);
    expect(result.totalFee).toBe(6.95);
  });

  it('adds per-lb fee for weight exceeding base', () => {
    // 3.5 lb total, 1.5 lb over base, 1.5 * $1.25 = $1.875 → rounded to $1.88
    const result = calculateShippingFee(baseTemplate, [], 3.5, []);
    expect(result.additionalWeightFee).toBeCloseTo(1.88, 2);
    expect(result.totalFee).toBeCloseTo(6.95 + 1.88, 2);
  });

  it('calculates additional weight fee for exactly 1 lb over', () => {
    // 3.0 lb — 1.0 lb over base — $1.25 additional
    const result = calculateShippingFee(baseTemplate, [], 3.0, []);
    expect(result.additionalWeightFee).toBe(1.25);
    expect(result.totalFee).toBeCloseTo(8.20, 2);
  });

  it('applies alaska_hawaii surcharge when condition is present', () => {
    const result = calculateShippingFee(
      baseTemplate,
      [alaskaHawaiiSurcharge],
      2.0,
      ['alaska_hawaii']
    );
    expect(result.surchargeTotal).toBe(5.00);
    expect(result.totalFee).toBeCloseTo(6.95 + 5.00, 2);
  });

  it('does not apply surcharge when condition is not in applicableConditions', () => {
    const result = calculateShippingFee(
      baseTemplate,
      [alaskaHawaiiSurcharge],
      2.0,
      [] // no applicable conditions
    );
    expect(result.surchargeTotal).toBe(0);
    expect(result.totalFee).toBe(6.95);
  });

  it('applies multiple surcharges when multiple conditions match', () => {
    const result = calculateShippingFee(
      baseTemplate,
      [alaskaHawaiiSurcharge, oversizeSurcharge],
      2.0,
      ['alaska_hawaii', 'oversize']
    );
    expect(result.surchargeTotal).toBe(20.00);
    expect(result.totalFee).toBeCloseTo(6.95 + 20.00, 2);
  });

  it('combines weight overage and surcharge', () => {
    // 4.0 lb = 2.0 lb over base = $2.50 + $5.00 surcharge + $6.95 base = $14.45
    const result = calculateShippingFee(
      baseTemplate,
      [alaskaHawaiiSurcharge],
      4.0,
      ['alaska_hawaii']
    );
    expect(result.baseFee).toBe(6.95);
    expect(result.additionalWeightFee).toBe(2.50);
    expect(result.surchargeTotal).toBe(5.00);
    expect(result.totalFee).toBeCloseTo(14.45, 2);
  });

  it('includes a breakdown array with all line items', () => {
    const result = calculateShippingFee(
      baseTemplate,
      [alaskaHawaiiSurcharge],
      3.0,
      ['alaska_hawaii']
    );
    expect(result.breakdown.length).toBe(3); // base + additional + surcharge
    expect(result.breakdown[0].label).toBe('Base fee');
    expect(result.breakdown[1].label).toContain('Additional weight');
    expect(result.breakdown[2].label).toContain('alaska_hawaii');
  });

  it('breakdown has only base fee when no overage and no surcharges', () => {
    const result = calculateShippingFee(baseTemplate, [], 2.0, []);
    expect(result.breakdown.length).toBe(1);
    expect(result.breakdown[0].label).toBe('Base fee');
  });

  it('handles very small fractional weights correctly', () => {
    // 0.1 lb over base → 0.1 * 1.25 = 0.125 → rounds to 0.13
    const result = calculateShippingFee(baseTemplate, [], 2.1, []);
    expect(result.additionalWeightFee).toBeCloseTo(0.13, 2);
  });
});
