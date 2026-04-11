import { z } from 'zod';
import { DiscountType } from './types.js';

export const createMemberSchema = z.object({
  studentId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  tierId: z.string().uuid(),
});

export const createCouponSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/, 'Coupon code must be uppercase alphanumeric with dashes'),
  discountType: z.nativeEnum(DiscountType),
  discountValue: z.number().gt(0).max(999999.99),
  minOrderAmount: z.number().min(0).max(999999.99).optional(),
  tierId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
  maxRedemptions: z.number().int().min(1).optional(),
});

export const walletTopUpSchema = z.object({
  amount: z.number().gt(0, 'Top-up amount must be greater than zero').max(999999.99),
});

export const walletSpendSchema = z.object({
  amount: z.number().gt(0, 'Spend amount must be greater than zero').max(999999.99),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().uuid().optional(),
});

export const createFulfillmentSchema = z.object({
  memberId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(1).max(64),
  lineItems: z.array(z.object({
    description: z.string().min(1).max(500),
    unitPrice: z.number().min(0).max(999999.99),
    quantity: z.number().int().min(1),
    itemCategory: z.string().max(100).optional(),
  })).min(1),
  couponCode: z.string().max(50).optional(),
  useWallet: z.boolean().optional(),
  shippingZipCode: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  shippingTier: z.string().max(20).optional(),
});

export const createMembershipTierSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.number().int().min(1),
  pointsThreshold: z.number().int().min(0),
  benefits: z.array(z.string().min(1).max(500)).min(1),
});
