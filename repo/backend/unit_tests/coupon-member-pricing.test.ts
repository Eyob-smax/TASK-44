import { describe, it, expect } from 'vitest';
import { DiscountType } from '../src/modules/memberships/types.js';

// Pure pricing helpers — no DB or HTTP dependencies

function applyMemberPricing(unitPrice: number, discountPercent: number): number {
  return parseFloat((unitPrice * (1 - discountPercent / 100)).toFixed(2));
}

function applyCouponDiscount(
  totalAmount: number,
  coupon: {
    discountType: DiscountType;
    discountValue: number;
    minOrderAmount?: number;
    isActive: boolean;
    expiresAt?: Date | null;
    maxRedemptions?: number | null;
    currentRedemptions?: number;
  },
  now: Date = new Date(),
): { applicable: boolean; discountAmount: number; reason?: string } {
  if (!coupon.isActive) return { applicable: false, discountAmount: 0, reason: 'Coupon inactive' };
  if (coupon.expiresAt && coupon.expiresAt < now) {
    return { applicable: false, discountAmount: 0, reason: 'Coupon expired' };
  }
  if (
    coupon.maxRedemptions != null &&
    (coupon.currentRedemptions ?? 0) >= coupon.maxRedemptions
  ) {
    return { applicable: false, discountAmount: 0, reason: 'Max redemptions reached' };
  }
  if (coupon.minOrderAmount != null && totalAmount < coupon.minOrderAmount) {
    return {
      applicable: false,
      discountAmount: 0,
      reason: `Minimum order amount $${coupon.minOrderAmount} not met`,
    };
  }

  let discountAmount: number;
  if (coupon.discountType === DiscountType.PERCENTAGE) {
    discountAmount = parseFloat(((totalAmount * coupon.discountValue) / 100).toFixed(2));
  } else {
    discountAmount = Math.min(coupon.discountValue, totalAmount);
  }
  return { applicable: true, discountAmount };
}

describe('Member pricing', () => {
  it('applies 10% discount to unit price of $10 → $9.00', () => {
    expect(applyMemberPricing(10, 10)).toBe(9.0);
  });

  it('applies 0% discount → price unchanged', () => {
    expect(applyMemberPricing(10, 0)).toBe(10.0);
  });

  it('applies 100% discount → price is $0.00', () => {
    expect(applyMemberPricing(10, 100)).toBe(0.0);
  });

  it('rounds to 2 decimal places', () => {
    // $9.99 × (1 - 33%) = $6.6933 → $6.69
    expect(applyMemberPricing(9.99, 33)).toBe(6.69);
  });
});

describe('Coupon — percentage discount', () => {
  const coupon = {
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10,
    isActive: true,
    expiresAt: null,
  };

  it('10% off $100 total → $10 discount', () => {
    const result = applyCouponDiscount(100, coupon);
    expect(result.applicable).toBe(true);
    expect(result.discountAmount).toBe(10);
  });

  it('applies to zero total correctly', () => {
    const result = applyCouponDiscount(0, coupon);
    expect(result.discountAmount).toBe(0);
  });
});

describe('Coupon — fixed discount', () => {
  const coupon = {
    discountType: DiscountType.FIXED_AMOUNT,
    discountValue: 5,
    isActive: true,
    expiresAt: null,
  };

  it('$5 off $100 total → $5 discount', () => {
    const result = applyCouponDiscount(100, coupon);
    expect(result.discountAmount).toBe(5);
  });

  it('$5 off $3 total → capped at $3 (cannot discount more than total)', () => {
    const result = applyCouponDiscount(3, coupon);
    expect(result.discountAmount).toBe(3);
  });
});

describe('Coupon guard conditions', () => {
  it('minOrderAmount: coupon not applied when total is below minimum', () => {
    const coupon = {
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 5,
      isActive: true,
      expiresAt: null,
      minOrderAmount: 50,
    };
    const result = applyCouponDiscount(30, coupon);
    expect(result.applicable).toBe(false);
    expect(result.reason).toMatch(/Minimum order/);
  });

  it('minOrderAmount: coupon applied when total meets minimum', () => {
    const coupon = {
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 5,
      isActive: true,
      expiresAt: null,
      minOrderAmount: 50,
    };
    const result = applyCouponDiscount(50, coupon);
    expect(result.applicable).toBe(true);
  });

  it('expired coupon: not applied', () => {
    const coupon = {
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      isActive: true,
      expiresAt: new Date('2020-01-01'),
    };
    const result = applyCouponDiscount(100, coupon, new Date('2024-01-01'));
    expect(result.applicable).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('inactive coupon: not applied', () => {
    const coupon = {
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      isActive: false,
      expiresAt: null,
    };
    const result = applyCouponDiscount(100, coupon);
    expect(result.applicable).toBe(false);
  });

  it('max redemptions reached: not applied', () => {
    const coupon = {
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      isActive: true,
      expiresAt: null,
      maxRedemptions: 5,
      currentRedemptions: 5,
    };
    const result = applyCouponDiscount(100, coupon);
    expect(result.applicable).toBe(false);
  });
});
