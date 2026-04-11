import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { membershipsOrgRouter, membershipsRouter } from '../src/modules/memberships/routes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { UnprocessableError, ValidationError } from '../src/common/errors/app-errors.js';

vi.mock('../src/modules/memberships/service.js', () => ({
  createFulfillment: vi.fn(),
  topUpWallet: vi.fn(),
  spendFromWallet: vi.fn(),
  upgradeIfEligible: vi.fn(),
}));

vi.mock('../src/modules/memberships/repository.js', () => ({
  createTier: vi.fn(),
  findTierById: vi.fn(),
  listTiers: vi.fn().mockResolvedValue([]),
  findNextTier: vi.fn().mockResolvedValue(null),
  listMembers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  createMember: vi.fn(),
  findMemberById: vi.fn(),
  findMemberByStudentId: vi.fn(),
  updateMemberTier: vi.fn(),
  createCoupon: vi.fn(),
  findCouponByCode: vi.fn(),
  incrementCouponRedemption: vi.fn(),
  createCouponRedemption: vi.fn(),
  findPricingRules: vi.fn().mockResolvedValue([]),
  findWalletByMember: vi.fn(),
  createWallet: vi.fn(),
  topUpWallet: vi.fn(),
  spendFromWallet: vi.fn(),
  refundToWallet: vi.fn(),
  createFulfillmentRequest: vi.fn(),
  findFulfillmentById: vi.fn(),
  findFulfillmentByIdempotencyKey: vi.fn().mockResolvedValue(null),
  createReceipt: vi.fn(),
  addPointTransaction: vi.fn(),
}));

vi.mock('../src/common/middleware/idempotency.js', () => ({
  idempotency: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    role: {
      findFirst: vi.fn().mockResolvedValue({ id: 'role-ops' }),
    },
    fieldMaskingRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    walletLedgerEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../src/common/encryption/aes256.js', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}));

const { createFulfillment, topUpWallet, spendFromWallet } = await import('../src/modules/memberships/service.js');
const { findMemberById } = await import('../src/modules/memberships/repository.js');
const { config } = await import('../src/app/config.js');

const jwtSecret = config.JWT_SECRET;

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'user-1',
      username: 'test',
      roles: ['OpsManager'],
      permissions: ['write:memberships:*', 'read:memberships:*'],
      orgId: 'org-1',
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orgs/:orgId', membershipsOrgRouter);
  app.use('/api/members', membershipsRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/orgs/:orgId/members', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated member list for org', async () => {
    const { listMembers } = await import('../src/modules/memberships/repository.js');
    vi.mocked(listMembers).mockResolvedValue({
      items: [
        { id: 'mem-1', orgId: 'org-1', tierId: 'tier-1', growthPoints: 100, tier: { name: 'Gold', level: 2 }, wallet: null },
      ] as any,
      total: 1,
    });

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/members')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.members).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    expect(listMembers).toHaveBeenCalledWith('org-1', expect.any(Object), expect.any(Object));
  });

  it('supports search and tierId query params', async () => {
    const { listMembers } = await import('../src/modules/memberships/repository.js');
    vi.mocked(listMembers).mockResolvedValue({ items: [], total: 0 });

    const app = buildApp();
    await request(app)
      .get('/api/orgs/org-1/members?search=Smith&tierId=tier-2')
      .set('Authorization', authHeader());

    expect(listMembers).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ search: 'Smith', tierId: 'tier-2' }),
      expect.any(Object),
    );
  });
});

describe('POST /api/members/:id/wallet/topup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and creates ledger entry + receipt', async () => {
    vi.mocked(findMemberById).mockResolvedValue({ id: 'member-1', orgId: 'org-1' } as any);

    vi.mocked(topUpWallet).mockResolvedValue({
      walletId: 'wallet-1',
      memberId: 'member-1',
      ledgerEntry: {
        id: 'ledger-1',
        entryType: 'TOPUP',
        amount: 50,
        balanceBefore: 0,
        balanceAfter: 50,
      },
      receipt: { id: 'rcpt-1', receiptNumber: 'RCP-2026-AB12CD34' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/members/member-1/wallet/topup')
      .set('Authorization', authHeader())
      .send({ amount: 50 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ledgerEntry.entryType).toBe('TOPUP');
    expect(res.body.data.receipt.receiptNumber).toMatch(/^RCP-/);
  });

  it('returns 400 VALIDATION_ERROR when amount is missing', async () => {
    vi.mocked(findMemberById).mockResolvedValue({ id: 'member-1', orgId: 'org-1' } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/members/member-1/wallet/topup')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when amount is zero', async () => {
    vi.mocked(findMemberById).mockResolvedValue({ id: 'member-1', orgId: 'org-1' } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/members/member-1/wallet/topup')
      .set('Authorization', authHeader())
      .send({ amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/members/:id/wallet/spend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 on successful spend', async () => {
    vi.mocked(findMemberById).mockResolvedValue({ id: 'member-1', orgId: 'org-1' } as any);

    vi.mocked(spendFromWallet).mockResolvedValue({
      walletId: 'wallet-1',
      memberId: 'member-1',
      ledgerEntry: {
        id: 'ledger-2',
        entryType: 'SPEND',
        amount: 20,
        balanceBefore: 50,
        balanceAfter: 30,
      },
      receipt: { id: 'rcpt-2', receiptNumber: 'RCP-2026-XY78ZW90' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/members/member-1/wallet/spend')
      .set('Authorization', authHeader())
      .send({ amount: 20 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ledgerEntry.balanceAfter).toBe(30);
  });

  it('returns 422 UNPROCESSABLE when insufficient balance', async () => {
    vi.mocked(findMemberById).mockResolvedValue({ id: 'member-1', orgId: 'org-1' } as any);

    vi.mocked(spendFromWallet).mockRejectedValue(
      new UnprocessableError('Insufficient balance: $10.00 available, $50.00 requested'),
    );

    const app = buildApp();
    const res = await request(app)
      .post('/api/members/member-1/wallet/spend')
      .set('Authorization', authHeader())
      .send({ amount: 50 });

    expect(res.status).toBe(422);
    expect(res.body.error?.message).toContain('Insufficient balance');
  });
});

describe('GET /api/orgs/:orgId/members permission rejection', () => {
  it('returns 403 when user lacks read:memberships permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/members')
      .set(
        'Authorization',
        authHeader({ roles: ['Viewer'], permissions: ['read:logistics:*'] }),
      );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/orgs/:orgId/fulfillments', () => {
  beforeEach(() => vi.clearAllMocks());

  const validFulfillmentBody = {
    idempotencyKey: 'fulfil-key-001',
    lineItems: [
      { description: 'Widget', unitPrice: 25.0, quantity: 2 },
    ],
  };

  it('returns 201 with fulfillment on success', async () => {
    vi.mocked(createFulfillment).mockResolvedValue({
      id: 'fulfil-1',
      orgId: 'org-1',
      status: 'confirmed',
      totalAmount: 50,
      discountAmount: 0,
      finalAmount: 50,
      lineItems: validFulfillmentBody.lineItems,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/fulfillments')
      .set('Authorization', authHeader())
      .send(validFulfillmentBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.finalAmount).toBe(50);
  });

  it('applies coupon discount when valid couponCode is provided', async () => {
    vi.mocked(createFulfillment).mockResolvedValue({
      id: 'fulfil-2',
      orgId: 'org-1',
      status: 'confirmed',
      totalAmount: 100,
      discountAmount: 10,
      finalAmount: 90,
      couponCode: 'SAVE10',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/fulfillments')
      .set('Authorization', authHeader())
      .send({ ...validFulfillmentBody, couponCode: 'SAVE10' });

    expect(res.status).toBe(201);
    expect(res.body.data.discountAmount).toBe(10);
    expect(res.body.data.finalAmount).toBe(90);
  });

  it('returns 422 when expired coupon is provided', async () => {
    vi.mocked(createFulfillment).mockRejectedValue(
      new UnprocessableError('Coupon EXPIRED10 is expired'),
    );

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/fulfillments')
      .set('Authorization', authHeader())
      .send({ ...validFulfillmentBody, couponCode: 'EXPIRED10' });

    expect(res.status).toBe(422);
  });

  it('returns same result on second call with same idempotencyKey', async () => {
    const mockResult = {
      id: 'fulfil-3',
      orgId: 'org-1',
      status: 'confirmed',
      totalAmount: 50,
      discountAmount: 0,
      finalAmount: 50,
    };
    vi.mocked(createFulfillment).mockResolvedValue(mockResult as any);

    const app = buildApp();

    const res1 = await request(app)
      .post('/api/orgs/org-1/fulfillments')
      .set('Authorization', authHeader())
      .send({ ...validFulfillmentBody, idempotencyKey: 'idem-fulfil-999' });

    const res2 = await request(app)
      .post('/api/orgs/org-1/fulfillments')
      .set('Authorization', authHeader())
      .send({ ...validFulfillmentBody, idempotencyKey: 'idem-fulfil-999' });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(res1.body.data.id);
  });
});

describe('GET /api/members/fulfillments/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when fulfillment belongs to a different org', async () => {
    const { findFulfillmentById } = await import('../src/modules/memberships/repository.js');
    vi.mocked(findFulfillmentById).mockResolvedValue({
      id: 'fulfil-foreign',
      orgId: 'org-2',
      status: 'confirmed',
      lineItems: [],
      totalAmount: 50,
      shippingFee: 0,
      discountAmount: 0,
      finalAmount: 50,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/members/fulfillments/fulfil-foreign')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 200 when fulfillment belongs to caller org', async () => {
    const { findFulfillmentById } = await import('../src/modules/memberships/repository.js');
    vi.mocked(findFulfillmentById).mockResolvedValue({
      id: 'fulfil-own',
      orgId: 'org-1',
      status: 'confirmed',
      lineItems: [],
      totalAmount: 75,
      shippingFee: 5,
      discountAmount: 0,
      finalAmount: 80,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/members/fulfillments/fulfil-own')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('fulfil-own');
  });
});
