import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { membershipsOrgRouter, membershipsRouter } from '../../src/modules/memberships/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';
import { updateConfig } from '../../src/modules/configuration/service.js';
import { _resetOverrides } from '../../src/modules/configuration/repository.js';

const RUN_ID = `memberships-write-wallet-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-memberships-write-wallet-int';

let orgId = '';
let userId = '';
let tierId = '';
let memberId = '';

function authHeader() {
  const token = jwt.sign(
    {
      userId,
      username: `memberships-write-${RUN_ID}`,
      roles: ['Administrator', 'OpsManager'],
      permissions: ['read:memberships:*', 'write:memberships:*'],
      orgId,
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

describe('No-mock HTTP integration: memberships write + wallet endpoints', () => {
  beforeAll(async () => {
    updateConfig({ storedValueEnabled: true });

    const org = await db.organization.create({
      data: {
        name: `Memberships Write Org ${RUN_ID}`,
        type: 'district',
        timezone: 'UTC',
      },
    });
    orgId = org.id;

    const user = await db.user.create({
      data: {
        username: `memberships_write_${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Memberships Write Integration User',
        isActive: true,
        orgId,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    _resetOverrides();
    await db.idempotencyRecord.deleteMany({ where: { key: { contains: RUN_ID } } });
    await db.printableReceipt.deleteMany({ where: { walletLedgerEntry: { wallet: { memberId } } } });
    await db.walletLedgerEntry.deleteMany({ where: { wallet: { memberId } } });
    await db.storedValueWallet.deleteMany({ where: { memberId } });
    await db.coupon.deleteMany({ where: { orgId, code: { startsWith: 'COUPON-' } } });
    if (memberId) {
      await db.member.deleteMany({ where: { id: memberId } });
    }
    if (tierId) {
      await db.membershipTier.deleteMany({ where: { id: tierId } });
    }
    if (userId) {
      await db.user.deleteMany({ where: { id: userId } });
    }
    if (orgId) {
      await db.organization.deleteMany({ where: { id: orgId } });
    }
  });

  it('covers tier/member/coupon creation and wallet read-write handlers without mocks', async () => {
    const app = buildApp();

    const tierRes = await request(app)
      .post(`/api/orgs/${orgId}/membership-tiers`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `tier-${RUN_ID}`)
      .send({
        name: `Tier ${RUN_ID}`,
        level: 1,
        pointsThreshold: 0,
        benefits: ['priority support'],
      });

    expect(tierRes.status).toBe(201);
    expect(tierRes.body.success).toBe(true);
    tierId = tierRes.body.data.id as string;

    const memberRes = await request(app)
      .post(`/api/orgs/${orgId}/members`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `member-${RUN_ID}`)
      .send({
        tierId,
      });

    expect(memberRes.status).toBe(201);
    expect(memberRes.body.success).toBe(true);
    memberId = memberRes.body.data.id as string;

    const couponRes = await request(app)
      .post(`/api/orgs/${orgId}/coupons`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `coupon-${RUN_ID}`)
      .send({
        code: `COUPON-${String(Date.now()).slice(-6)}`,
        discountType: 'fixed_amount',
        discountValue: 5,
        tierId,
      });

    expect(couponRes.status).toBe(201);
    expect(couponRes.body.success).toBe(true);

    const topupRes = await request(app)
      .post(`/api/members/${memberId}/wallet/topup`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `wallet-topup-${RUN_ID}`)
      .send({ amount: 20 });

    expect(topupRes.status).toBe(200);
    expect(topupRes.body.success).toBe(true);

    const walletRes = await request(app)
      .get(`/api/members/${memberId}/wallet`)
      .set('Authorization', authHeader());

    expect(walletRes.status).toBe(200);
    expect(walletRes.body.success).toBe(true);
    expect(walletRes.body.data.balance).toBeGreaterThanOrEqual(20);

    const spendRes = await request(app)
      .post(`/api/members/${memberId}/wallet/spend`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `wallet-spend-${RUN_ID}`)
      .send({ amount: 5 });

    expect(spendRes.status).toBe(200);
    expect(spendRes.body.success).toBe(true);

    const walletAfterSpendRes = await request(app)
      .get(`/api/members/${memberId}/wallet`)
      .set('Authorization', authHeader());

    expect(walletAfterSpendRes.status).toBe(200);
    expect(walletAfterSpendRes.body.success).toBe(true);
    expect(walletAfterSpendRes.body.data.balance).toBeGreaterThanOrEqual(15);
    expect(walletAfterSpendRes.body.data.balance).toBeLessThan(20);
  });
});
