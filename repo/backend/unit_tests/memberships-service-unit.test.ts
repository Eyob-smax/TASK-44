import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRepo = {
  findFulfillmentByIdempotencyKey: vi.fn(),
  findFulfillmentById: vi.fn(),
  findMemberById: vi.fn(),
  findPricingRules: vi.fn(),
  findCouponByCode: vi.fn(),
  createFulfillmentRequest: vi.fn(),
  incrementCouponRedemption: vi.fn(),
  createCouponRedemption: vi.fn(),
  addPointTransaction: vi.fn(),
  findNextTier: vi.fn(),
  updateMemberTier: vi.fn(),
  findWalletByMember: vi.fn(),
  spendFromWallet: vi.fn(),
  topUpWallet: vi.fn(),
  createWallet: vi.fn(),
  createReceipt: vi.fn(),
};

const mockLogisticsRepo = {
  isZipServiceable: vi.fn(),
  findTemplateByRegionAndTier: vi.fn(),
};

vi.mock('../src/modules/memberships/repository.js', () => mockRepo);
vi.mock('../src/modules/logistics/repository.js', () => mockLogisticsRepo);
vi.mock('../src/app/container.js', () => ({ db: {} }));

const mockGetConfig = vi.fn(() => ({ config: { storedValueEnabled: true } }));
vi.mock('../src/modules/configuration/service.js', () => ({ getConfig: mockGetConfig }));

const service = await import('../src/modules/memberships/service.js');

const ORG = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfig.mockReturnValue({ config: { storedValueEnabled: true } });
});

// ============================================================================
// createFulfillment — idempotency
// ============================================================================

describe('createFulfillment — idempotency', () => {
  it('returns existing fulfillment when idempotency key was already used', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue({ id: 'ful-existing' });
    mockRepo.findFulfillmentById.mockResolvedValue({ id: 'ful-existing', totalAmount: 99 });

    const result = await service.createFulfillment(ORG, {
      idempotencyKey: 'key-1',
      lineItems: [{ description: 'Item', unitPrice: 10, quantity: 1 }],
    });

    expect(result).toMatchObject({ id: 'ful-existing' });
    // Did not proceed to compute pricing or create a new fulfillment
    expect(mockRepo.createFulfillmentRequest).not.toHaveBeenCalled();
    expect(mockRepo.findMemberById).not.toHaveBeenCalled();
  });
});

// ============================================================================
// createFulfillment — guest path (no member)
// ============================================================================

describe('createFulfillment — guest checkout (no member)', () => {
  it('computes totalAmount with no member pricing applied', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockRepo.createFulfillmentRequest.mockResolvedValue({ id: 'ful-new' });
    mockRepo.createReceipt.mockResolvedValue({ id: 'r-1' });
    mockRepo.findFulfillmentById.mockResolvedValue({ id: 'ful-new' });

    await service.createFulfillment(ORG, {
      idempotencyKey: 'k-guest',
      lineItems: [
        { description: 'Item A', unitPrice: 10, quantity: 2 },
        { description: 'Item B', unitPrice: 5, quantity: 1 },
      ],
    });

    expect(mockRepo.createFulfillmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 25,
        finalAmount: 25,
        discountAmount: 0,
        shippingFee: 0,
      }),
    );
    // No coupon, no points, no wallet — only a basic receipt
    expect(mockRepo.createReceipt).toHaveBeenCalledWith({ fulfillmentRequestId: 'ful-new' });
    expect(mockRepo.addPointTransaction).not.toHaveBeenCalled();
  });
});

// ============================================================================
// createFulfillment — member pricing & growth points
// ============================================================================

describe('createFulfillment — member pricing', () => {
  it('throws NotFoundError when member is not found', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockRepo.findMemberById.mockResolvedValue(null);

    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-missing',
        idempotencyKey: 'k1',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/Member not found/);
  });

  it('rejects member from a different org as NotFoundError', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockRepo.findMemberById.mockResolvedValue({ id: 'mem-1', orgId: 'OTHER-ORG', tierId: 't1' });

    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-1',
        idempotencyKey: 'k1',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/Member not found/);
  });

  it('applies member pricing rule when itemCategory matches and earns growth points', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockRepo.findMemberById.mockResolvedValue({
      id: 'mem-1', orgId: ORG, tierId: 't-silver', tier: { level: 1 }, growthPoints: 0,
    });
    mockRepo.findPricingRules.mockResolvedValue([
      { itemCategory: 'apparel', discountPercent: 10 },
    ]);
    mockRepo.createFulfillmentRequest.mockResolvedValue({ id: 'ful-1' });
    mockRepo.createReceipt.mockResolvedValue({});
    mockRepo.findNextTier.mockResolvedValue(null);
    mockRepo.findFulfillmentById.mockResolvedValue({ id: 'ful-1' });

    await service.createFulfillment(ORG, {
      memberId: 'mem-1',
      idempotencyKey: 'k1',
      lineItems: [{ description: 'Hat', unitPrice: 20, quantity: 2, itemCategory: 'apparel' }],
    });

    // 20 * 0.9 = 18 per unit, x 2 = 36
    expect(mockRepo.createFulfillmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 36,
        lineItems: [expect.objectContaining({ memberPrice: 18 })],
      }),
    );
    // 36 points earned (1pt per $1 of finalAmount)
    expect(mockRepo.addPointTransaction).toHaveBeenCalledWith(
      'mem-1',
      36,
      expect.stringMatching(/Points earned/),
      'fulfillment_request',
      'ful-1',
    );
  });

  it('does not apply pricing rule when category does not match any rule', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockRepo.findMemberById.mockResolvedValue({
      id: 'mem-1', orgId: ORG, tierId: 't1', tier: { level: 1 }, growthPoints: 0,
    });
    mockRepo.findPricingRules.mockResolvedValue([{ itemCategory: 'apparel', discountPercent: 10 }]);
    mockRepo.createFulfillmentRequest.mockResolvedValue({ id: 'ful-1' });
    mockRepo.createReceipt.mockResolvedValue({});
    mockRepo.findNextTier.mockResolvedValue(null);
    mockRepo.findFulfillmentById.mockResolvedValue({});

    await service.createFulfillment(ORG, {
      memberId: 'mem-1',
      idempotencyKey: 'k1',
      lineItems: [{ description: 'Mug', unitPrice: 10, quantity: 1, itemCategory: 'kitchenware' }],
    });
    expect(mockRepo.createFulfillmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 10,
        lineItems: [expect.objectContaining({ memberPrice: undefined })],
      }),
    );
  });
});

// ============================================================================
// createFulfillment — coupon validation
// ============================================================================

describe('createFulfillment — coupon', () => {
  function memberSetup() {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockRepo.findMemberById.mockResolvedValue({
      id: 'mem-1', orgId: ORG, tierId: 't1', tier: { level: 1 }, growthPoints: 0,
    });
    mockRepo.findPricingRules.mockResolvedValue([]);
    mockRepo.createFulfillmentRequest.mockResolvedValue({ id: 'ful-1' });
    mockRepo.createReceipt.mockResolvedValue({});
    mockRepo.findNextTier.mockResolvedValue(null);
    mockRepo.findFulfillmentById.mockResolvedValue({});
  }

  it('throws NotFoundError when coupon code does not exist', async () => {
    memberSetup();
    mockRepo.findCouponByCode.mockResolvedValue(null);
    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-1',
        idempotencyKey: 'k1',
        couponCode: 'NOPE',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/Coupon not found/);
  });

  it('throws Unprocessable when coupon is inactive', async () => {
    memberSetup();
    mockRepo.findCouponByCode.mockResolvedValue({
      id: 'c1', isActive: false, discountType: 'percentage', discountValue: 10,
      currentRedemptions: 0, maxRedemptions: null, expiresAt: null, tierId: null, minOrderAmount: null,
    });
    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-1', idempotencyKey: 'k1', couponCode: 'OFF',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/Coupon is not active/);
  });

  it('throws Unprocessable when coupon has expired', async () => {
    memberSetup();
    mockRepo.findCouponByCode.mockResolvedValue({
      id: 'c1', isActive: true, expiresAt: new Date(Date.now() - 60_000),
      discountType: 'percentage', discountValue: 10, currentRedemptions: 0,
      maxRedemptions: null, tierId: null, minOrderAmount: null,
    });
    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-1', idempotencyKey: 'k1', couponCode: 'OLD',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/expired/);
  });

  it('throws Unprocessable when coupon redemption cap is reached', async () => {
    memberSetup();
    mockRepo.findCouponByCode.mockResolvedValue({
      id: 'c1', isActive: true, expiresAt: null,
      discountType: 'percentage', discountValue: 10,
      currentRedemptions: 5, maxRedemptions: 5,
      tierId: null, minOrderAmount: null,
    });
    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-1', idempotencyKey: 'k1', couponCode: 'MAX',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/maximum redemptions/);
  });

  it('throws Unprocessable when coupon is for a different tier', async () => {
    memberSetup();
    mockRepo.findCouponByCode.mockResolvedValue({
      id: 'c1', isActive: true, expiresAt: null,
      discountType: 'percentage', discountValue: 10,
      currentRedemptions: 0, maxRedemptions: null,
      tierId: 't-gold', minOrderAmount: null,
    });
    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-1', idempotencyKey: 'k1', couponCode: 'GOLD',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/not available for your membership tier/);
  });

  it('throws Unprocessable when totalAmount is below coupon minOrderAmount', async () => {
    memberSetup();
    mockRepo.findCouponByCode.mockResolvedValue({
      id: 'c1', isActive: true, expiresAt: null,
      discountType: 'fixed_amount', discountValue: 5,
      currentRedemptions: 0, maxRedemptions: null,
      tierId: null, minOrderAmount: 50,
    });
    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-1', idempotencyKey: 'k1', couponCode: 'BIGORDER',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/at least \$50/);
  });

  it('applies percentage coupon and increments redemption + creates redemption record', async () => {
    memberSetup();
    mockRepo.findCouponByCode.mockResolvedValue({
      id: 'c1', isActive: true, expiresAt: null,
      discountType: 'percentage', discountValue: 10,
      currentRedemptions: 0, maxRedemptions: null,
      tierId: null, minOrderAmount: null,
    });

    await service.createFulfillment(ORG, {
      memberId: 'mem-1', idempotencyKey: 'k1', couponCode: 'TENOFF',
      lineItems: [{ description: 'X', unitPrice: 100, quantity: 1 }],
    });

    expect(mockRepo.createFulfillmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 100,
        discountAmount: 10,
        finalAmount: 90,
      }),
    );
    expect(mockRepo.incrementCouponRedemption).toHaveBeenCalledWith('c1');
    expect(mockRepo.createCouponRedemption).toHaveBeenCalledWith('c1', 'mem-1', 'ful-1');
  });

  it('applies fixed-amount coupon and caps discount at totalAmount', async () => {
    memberSetup();
    mockRepo.findCouponByCode.mockResolvedValue({
      id: 'c1', isActive: true, expiresAt: null,
      discountType: 'fixed_amount', discountValue: 50,
      currentRedemptions: 0, maxRedemptions: null,
      tierId: null, minOrderAmount: null,
    });
    await service.createFulfillment(ORG, {
      memberId: 'mem-1', idempotencyKey: 'k1', couponCode: 'OVERFLOW',
      lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
    });
    expect(mockRepo.createFulfillmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 10,
        discountAmount: 10, // capped from 50 to 10
        finalAmount: 0,
      }),
    );
  });
});

// ============================================================================
// createFulfillment — shipping
// ============================================================================

describe('createFulfillment — shipping', () => {
  it('throws Unprocessable when ZIP code is not serviceable', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockLogisticsRepo.isZipServiceable.mockResolvedValue(false);

    await expect(
      service.createFulfillment(ORG, {
        idempotencyKey: 'k1',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
        shippingZipCode: '12345',
        shippingTier: 'standard',
      }),
    ).rejects.toThrow(/12345 is not serviceable/);
  });

  it('skips shipping calculation when shippingZipCode/shippingTier are not provided', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockRepo.createFulfillmentRequest.mockResolvedValue({ id: 'f1' });
    mockRepo.createReceipt.mockResolvedValue({});
    mockRepo.findFulfillmentById.mockResolvedValue({});

    await service.createFulfillment(ORG, {
      idempotencyKey: 'k1',
      lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
    });

    expect(mockLogisticsRepo.isZipServiceable).not.toHaveBeenCalled();
    expect(mockLogisticsRepo.findTemplateByRegionAndTier).not.toHaveBeenCalled();
    expect(mockRepo.createFulfillmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ shippingFee: 0 }),
    );
  });

  it('applies template-based shipping fee when zip is serviceable and template exists', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockLogisticsRepo.isZipServiceable.mockResolvedValue(true);
    mockLogisticsRepo.findTemplateByRegionAndTier.mockResolvedValue({
      id: 'tpl-1',
      baseFee: 5,
      baseWeightLb: 1,
      perAdditionalLbFee: 2,
      surcharges: [],
    });
    mockRepo.createFulfillmentRequest.mockResolvedValue({ id: 'ful-1' });
    mockRepo.createReceipt.mockResolvedValue({});
    mockRepo.findFulfillmentById.mockResolvedValue({});

    await service.createFulfillment(ORG, {
      idempotencyKey: 'k1',
      lineItems: [{ description: 'X', unitPrice: 10, quantity: 4 }], // 4 items × 0.5lb = 2lb total
      shippingZipCode: '12345',
      shippingTier: 'standard',
    });

    // Region from zip: '123'
    expect(mockLogisticsRepo.findTemplateByRegionAndTier).toHaveBeenCalledWith(
      ORG,
      '123',
      'standard',
      4,
    );
    // Shipping fee is non-zero (delegated to calculateShippingFee)
    const created = mockRepo.createFulfillmentRequest.mock.calls[0][0];
    expect(created.shippingFee).toBeGreaterThan(0);
  });

  it('falls back to shippingFee=0 when no matching template exists', async () => {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockLogisticsRepo.isZipServiceable.mockResolvedValue(true);
    mockLogisticsRepo.findTemplateByRegionAndTier.mockResolvedValue(null);
    mockRepo.createFulfillmentRequest.mockResolvedValue({ id: 'f1' });
    mockRepo.createReceipt.mockResolvedValue({});
    mockRepo.findFulfillmentById.mockResolvedValue({});

    await service.createFulfillment(ORG, {
      idempotencyKey: 'k1',
      lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      shippingZipCode: '99999',
      shippingTier: 'standard',
    });

    expect(mockRepo.createFulfillmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ shippingFee: 0 }),
    );
  });
});

// ============================================================================
// createFulfillment — wallet spend
// ============================================================================

describe('createFulfillment — wallet spend', () => {
  function setup() {
    mockRepo.findFulfillmentByIdempotencyKey.mockResolvedValue(null);
    mockRepo.findMemberById.mockResolvedValue({
      id: 'mem-1', orgId: ORG, tierId: 't1', tier: { level: 1 }, growthPoints: 0,
    });
    mockRepo.findPricingRules.mockResolvedValue([]);
    mockRepo.createFulfillmentRequest.mockResolvedValue({ id: 'ful-1' });
    mockRepo.findNextTier.mockResolvedValue(null);
    mockRepo.findFulfillmentById.mockResolvedValue({});
  }

  it('rejects useWallet=true when storedValueEnabled is false', async () => {
    setup();
    mockGetConfig.mockReturnValue({ config: { storedValueEnabled: false } });

    await expect(
      service.createFulfillment(ORG, {
        memberId: 'mem-1',
        idempotencyKey: 'k1',
        useWallet: true,
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
    ).rejects.toThrow(/Stored value is disabled/);
  });

  it('spends from wallet up to balance and creates wallet-linked receipt', async () => {
    setup();
    mockRepo.findWalletByMember.mockResolvedValue({
      id: 'w1', isEnabled: true, balance: 7,
    });
    mockRepo.spendFromWallet.mockResolvedValue({ id: 'led-1' });
    mockRepo.createReceipt.mockResolvedValue({});

    await service.createFulfillment(ORG, {
      memberId: 'mem-1',
      idempotencyKey: 'k1',
      useWallet: true,
      lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
    });

    // finalAmount = 10, balance = 7 → spend 7
    expect(mockRepo.spendFromWallet).toHaveBeenCalledWith('w1', 7, 'fulfillment_request', 'ful-1');
    expect(mockRepo.createReceipt).toHaveBeenCalledWith({
      fulfillmentRequestId: 'ful-1',
      walletLedgerEntryId: 'led-1',
    });
  });

  it('creates basic receipt (no wallet) when wallet is disabled', async () => {
    setup();
    mockRepo.findWalletByMember.mockResolvedValue({ id: 'w1', isEnabled: false, balance: 50 });
    mockRepo.createReceipt.mockResolvedValue({});

    await service.createFulfillment(ORG, {
      memberId: 'mem-1',
      idempotencyKey: 'k1',
      useWallet: true,
      lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
    });
    expect(mockRepo.spendFromWallet).not.toHaveBeenCalled();
  });

  it('creates basic receipt when useWallet=false', async () => {
    setup();
    mockRepo.createReceipt.mockResolvedValue({});

    await service.createFulfillment(ORG, {
      memberId: 'mem-1',
      idempotencyKey: 'k1',
      useWallet: false,
      lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
    });
    expect(mockRepo.spendFromWallet).not.toHaveBeenCalled();
    expect(mockRepo.createReceipt).toHaveBeenCalledWith({ fulfillmentRequestId: 'ful-1' });
  });
});

// ============================================================================
// topUpWallet
// ============================================================================

describe('topUpWallet', () => {
  it('throws Unprocessable when storedValueEnabled is false', async () => {
    mockGetConfig.mockReturnValue({ config: { storedValueEnabled: false } });
    await expect(service.topUpWallet('mem-1', 50)).rejects.toThrow(/Stored value is disabled/);
  });

  it('creates wallet on first top-up when none exists yet', async () => {
    mockRepo.findWalletByMember.mockResolvedValueOnce(null);
    mockRepo.findMemberById.mockResolvedValue({ id: 'mem-1' });
    mockRepo.createWallet.mockResolvedValue({ id: 'w-new', isEnabled: true });
    mockRepo.topUpWallet.mockResolvedValue({ id: 'led-1' });
    mockRepo.createReceipt.mockResolvedValue({ id: 'r-1' });

    const result = await service.topUpWallet('mem-1', 25);
    expect(mockRepo.createWallet).toHaveBeenCalledWith('mem-1');
    expect(mockRepo.topUpWallet).toHaveBeenCalledWith('w-new', 25, 'manual_topup', undefined);
    expect(result).toMatchObject({ ledgerEntry: { id: 'led-1' }, receipt: { id: 'r-1' } });
  });

  it('throws NotFoundError when first top-up has no member', async () => {
    mockRepo.findWalletByMember.mockResolvedValueOnce(null);
    mockRepo.findMemberById.mockResolvedValue(null);
    await expect(service.topUpWallet('mem-missing', 25)).rejects.toThrow(/Member not found/);
  });

  it('throws Unprocessable when wallet is disabled', async () => {
    mockRepo.findWalletByMember.mockResolvedValue({ id: 'w-1', isEnabled: false, balance: 0 });
    await expect(service.topUpWallet('mem-1', 25)).rejects.toThrow(/Wallet is disabled/);
  });

  it('tops up an existing enabled wallet', async () => {
    mockRepo.findWalletByMember.mockResolvedValue({ id: 'w-1', isEnabled: true, balance: 100 });
    mockRepo.topUpWallet.mockResolvedValue({ id: 'led-2' });
    mockRepo.createReceipt.mockResolvedValue({ id: 'r-2' });

    await service.topUpWallet('mem-1', 50);
    expect(mockRepo.topUpWallet).toHaveBeenCalledWith('w-1', 50, 'manual_topup', undefined);
  });
});

// ============================================================================
// spendFromWallet
// ============================================================================

describe('spendFromWallet', () => {
  it('throws Unprocessable when storedValueEnabled is false', async () => {
    mockGetConfig.mockReturnValue({ config: { storedValueEnabled: false } });
    await expect(service.spendFromWallet('mem-1', 10)).rejects.toThrow(/Stored value is disabled/);
  });

  it('throws NotFoundError when wallet does not exist', async () => {
    mockRepo.findWalletByMember.mockResolvedValue(null);
    await expect(service.spendFromWallet('mem-1', 10)).rejects.toThrow(/Wallet not found/);
  });

  it('throws Unprocessable when wallet is disabled', async () => {
    mockRepo.findWalletByMember.mockResolvedValue({ id: 'w-1', isEnabled: false });
    await expect(service.spendFromWallet('mem-1', 10)).rejects.toThrow(/Wallet is disabled/);
  });

  it('spends from wallet and creates a receipt', async () => {
    mockRepo.findWalletByMember.mockResolvedValue({ id: 'w-1', isEnabled: true });
    mockRepo.spendFromWallet.mockResolvedValue({ id: 'led-3' });
    mockRepo.createReceipt.mockResolvedValue({ id: 'r-3' });

    const result = await service.spendFromWallet('mem-1', 10, 'manual', 'ref-1');
    expect(mockRepo.spendFromWallet).toHaveBeenCalledWith('w-1', 10, 'manual', 'ref-1');
    expect(result.receipt).toMatchObject({ id: 'r-3' });
  });
});

// ============================================================================
// upgradeIfEligible
// ============================================================================

describe('upgradeIfEligible', () => {
  it('returns silently when member does not exist', async () => {
    mockRepo.findMemberById.mockResolvedValue(null);
    await service.upgradeIfEligible('mem-missing');
    expect(mockRepo.updateMemberTier).not.toHaveBeenCalled();
  });

  it('returns silently when member is already at the highest tier', async () => {
    mockRepo.findMemberById.mockResolvedValue({
      id: 'mem-1', orgId: ORG, tier: { level: 5 }, growthPoints: 9999,
    });
    mockRepo.findNextTier.mockResolvedValue(null);
    await service.upgradeIfEligible('mem-1');
    expect(mockRepo.updateMemberTier).not.toHaveBeenCalled();
  });

  it('does not upgrade when growthPoints is below the next tier threshold', async () => {
    mockRepo.findMemberById.mockResolvedValue({
      id: 'mem-1', orgId: ORG, tier: { level: 1 }, growthPoints: 50,
    });
    mockRepo.findNextTier.mockResolvedValue({ id: 't-silver', pointsThreshold: 100 });
    await service.upgradeIfEligible('mem-1');
    expect(mockRepo.updateMemberTier).not.toHaveBeenCalled();
  });

  it('upgrades when growthPoints meets/exceeds next tier threshold', async () => {
    mockRepo.findMemberById.mockResolvedValue({
      id: 'mem-1', orgId: ORG, tier: { level: 1 }, growthPoints: 150,
    });
    mockRepo.findNextTier.mockResolvedValue({ id: 't-silver', pointsThreshold: 100 });
    await service.upgradeIfEligible('mem-1');
    expect(mockRepo.updateMemberTier).toHaveBeenCalledWith('mem-1', 't-silver');
  });
});
