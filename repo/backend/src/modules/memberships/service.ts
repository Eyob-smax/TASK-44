import { NotFoundError, UnprocessableError } from '../../common/errors/app-errors.js';
import { DiscountType, type CreateFulfillmentRequest } from './types.js';
import * as repo from './repository.js';
import { isZipServiceable, findTemplateByRegionAndTier } from '../logistics/repository.js';
import { calculateShippingFee } from '../logistics/types.js';
import { getConfig } from '../configuration/service.js';

function assertStoredValueEnabled(): void {
  if (!getConfig().config.storedValueEnabled) {
    throw new UnprocessableError('Stored value is disabled by system configuration');
  }
}

// ---- Fulfillment ----

export async function createFulfillment(orgId: string, data: CreateFulfillmentRequest) {
  // Idempotency is scoped by org to prevent cross-tenant replay.
  const existing = await repo.findFulfillmentByIdempotencyKey(data.idempotencyKey, orgId);
  if (existing) {
    const full = await repo.findFulfillmentById(existing.id);
    return full;
  }

  let member: Awaited<ReturnType<typeof repo.findMemberById>> = null;
  let pricingRules: Awaited<ReturnType<typeof repo.findPricingRules>> = [];

  if (data.memberId) {
    member = await repo.findMemberById(data.memberId);
    if (!member || member.orgId !== orgId) throw new NotFoundError('Member not found');
    pricingRules = await repo.findPricingRules(orgId, member.tierId);
  }

  // Apply member pricing per line item
  const pricedItems = data.lineItems.map((li) => {
    if (!li.itemCategory) return { ...li, memberPrice: undefined };

    const rule = pricingRules.find((r) => r.itemCategory === li.itemCategory);
    if (!rule) return { ...li, memberPrice: undefined };

    const memberPrice = parseFloat(
      (li.unitPrice * (1 - parseFloat(rule.discountPercent.toString()) / 100)).toFixed(2),
    );
    return { ...li, memberPrice };
  });

  // Compute totalAmount
  const totalAmount = parseFloat(
    pricedItems
      .reduce((sum, li) => sum + (li.memberPrice ?? li.unitPrice) * li.quantity, 0)
      .toFixed(2),
  );

  // Apply coupon discount
  let discountAmount = 0;
  let couponId: string | undefined;

  if (data.couponCode) {
    const coupon = await repo.findCouponByCode(orgId, data.couponCode);
    if (!coupon) throw new NotFoundError('Coupon not found');
    if (!coupon.isActive) throw new UnprocessableError('Coupon is not active');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new UnprocessableError('Coupon has expired');
    }
    if (coupon.maxRedemptions !== null && coupon.currentRedemptions >= coupon.maxRedemptions) {
      throw new UnprocessableError('Coupon has reached maximum redemptions');
    }
    if (coupon.tierId && member?.tierId !== coupon.tierId) {
      throw new UnprocessableError('Coupon is not available for your membership tier');
    }
    if (coupon.minOrderAmount !== null && totalAmount < parseFloat(coupon.minOrderAmount.toString())) {
      throw new UnprocessableError(
        `Order total must be at least $${parseFloat(coupon.minOrderAmount.toString()).toFixed(2)} to use this coupon`,
      );
    }

    const couponValue = parseFloat(coupon.discountValue.toString());
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discountAmount = parseFloat(((totalAmount * couponValue) / 100).toFixed(2));
    } else {
      discountAmount = Math.min(couponValue, totalAmount);
    }
    couponId = coupon.id;
  }

  // Shipping fee
  let shippingFee = 0;
  if (data.shippingZipCode && data.shippingTier) {
    const serviceable = await isZipServiceable(orgId, data.shippingZipCode);
    if (!serviceable) {
      throw new UnprocessableError(`ZIP code ${data.shippingZipCode} is not serviceable`);
    }

    const totalWeight = data.lineItems.reduce((sum, li) => sum + li.quantity * 0.5, 0); // default 0.5lb per item
    const template = await findTemplateByRegionAndTier(
      orgId,
      data.shippingZipCode.substring(0, 3), // use first 3 digits as region code approximation
      data.shippingTier,
      data.lineItems.reduce((sum, li) => sum + li.quantity, 0),
    );

    if (template) {
      const surcharges = template.surcharges.map((s) => ({
        condition: s.condition,
        surchargeAmount: parseFloat(s.surchargeAmount.toString()),
      }));
      const result = calculateShippingFee(
        {
          id: template.id,
          baseFee: parseFloat(template.baseFee.toString()),
          baseWeightLb: parseFloat(template.baseWeightLb.toString()),
          perAdditionalLbFee: parseFloat(template.perAdditionalLbFee.toString()),
        },
        surcharges,
        totalWeight,
        [],
      );
      shippingFee = result.totalFee;
    }
  }

  const finalAmount = parseFloat((totalAmount - discountAmount + shippingFee).toFixed(2));

  // Create fulfillment request
  const fulfillment = await repo.createFulfillmentRequest({
    orgId,
    memberId: data.memberId,
    idempotencyKey: data.idempotencyKey,
    totalAmount,
    shippingFee,
    discountAmount,
    finalAmount,
    lineItems: pricedItems.map((li) => ({
      description: li.description,
      unitPrice: li.unitPrice,
      quantity: li.quantity,
      memberPrice: li.memberPrice,
    })),
  });

  // Redeem coupon
  if (couponId && member) {
    await repo.incrementCouponRedemption(couponId);
    await repo.createCouponRedemption(couponId, member.id, fulfillment.id);
  }

  // Earn growth points: 1pt per $1 spent (based on finalAmount)
  if (member) {
    const pts = Math.floor(finalAmount);
    if (pts > 0) {
      await repo.addPointTransaction(
        member.id,
        pts,
        `Points earned from fulfillment ${fulfillment.id}`,
        'fulfillment_request',
        fulfillment.id,
      );
      // Check for tier upgrade
      await upgradeIfEligible(member.id);
    }
  }

  // Spend from wallet if requested
  if (data.useWallet && member) {
    assertStoredValueEnabled();
    const wallet = await repo.findWalletByMember(member.id);
    if (wallet && wallet.isEnabled && wallet.balance > 0) {
      const spendAmount = Math.min(wallet.balance, finalAmount);
      const ledgerEntry = await repo.spendFromWallet(
        wallet.id,
        spendAmount,
        'fulfillment_request',
        fulfillment.id,
      );
      await repo.createReceipt({ fulfillmentRequestId: fulfillment.id, walletLedgerEntryId: ledgerEntry.id });
    }
  } else {
    await repo.createReceipt({ fulfillmentRequestId: fulfillment.id });
  }

  return repo.findFulfillmentById(fulfillment.id);
}

// ---- Wallet ----

export async function topUpWallet(memberId: string, amount: number) {
  assertStoredValueEnabled();

  let wallet = await repo.findWalletByMember(memberId);
  if (!wallet) {
    const member = await repo.findMemberById(memberId);
    if (!member) throw new NotFoundError('Member not found');
    wallet = { ...(await repo.createWallet(memberId)), balance: 0 };
  }

  if (!wallet.isEnabled) throw new UnprocessableError('Wallet is disabled');

  const ledgerEntry = await repo.topUpWallet(wallet.id, amount, 'manual_topup', undefined);
  const receipt = await repo.createReceipt({ walletLedgerEntryId: ledgerEntry.id });
  return { ledgerEntry, receipt };
}

export async function spendFromWallet(
  memberId: string,
  amount: number,
  referenceType?: string,
  referenceId?: string,
) {
  assertStoredValueEnabled();

  const wallet = await repo.findWalletByMember(memberId);
  if (!wallet) throw new NotFoundError('Wallet not found');
  if (!wallet.isEnabled) throw new UnprocessableError('Wallet is disabled');

  const ledgerEntry = await repo.spendFromWallet(wallet.id, amount, referenceType, referenceId);
  const receipt = await repo.createReceipt({ walletLedgerEntryId: ledgerEntry.id });
  return { ledgerEntry, receipt };
}

// ---- Tier upgrade ----

export async function upgradeIfEligible(memberId: string) {
  const member = await repo.findMemberById(memberId);
  if (!member) return;

  const nextTier = await repo.findNextTier(member.orgId, member.tier.level);
  if (!nextTier) return; // already at highest tier

  if (member.growthPoints >= nextTier.pointsThreshold) {
    await repo.updateMemberTier(memberId, nextTier.id);
  }
}
