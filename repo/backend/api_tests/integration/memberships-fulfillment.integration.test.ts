import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { membershipsOrgRouter, membershipsRouter } from '../../src/modules/memberships/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `memberships-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-memberships-integration';

let orgAId = '';
let orgBId = '';
let tierAId = '';
let tierBId = '';
let memberAId = '';
let memberBId = '';
let fulfillmentId = '';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'integration-user-2',
      username: 'integration-user',
      roles: ['OpsManager'],
      permissions: ['read:memberships:*', 'write:memberships:*'],
      orgId: orgAId,
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

function isPreparedStatementReprepareError(error: unknown) {
  return error instanceof Error && error.message.includes('Prepared statement needs to be re-prepared');
}

async function withMysqlRetry(action: () => Promise<void>, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await action();
      return;
    } catch (error) {
      if (attempt === maxAttempts || !isPreparedStatementReprepareError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
}

describe('DB-backed API integration: memberships fulfillment', () => {
  beforeAll(async () => {
    const [orgA, orgB] = await Promise.all([
      db.organization.create({
        data: {
          name: `Membership Org A ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
      db.organization.create({
        data: {
          name: `Membership Org B ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
    ]);

    orgAId = orgA.id;
    orgBId = orgB.id;

    const [tierA, tierB] = await Promise.all([
      db.membershipTier.create({
        data: {
          orgId: orgAId,
          name: `Silver ${RUN_ID}`,
          level: 1,
          pointsThreshold: 0,
          benefits: '[]',
        },
      }),
      db.membershipTier.create({
        data: {
          orgId: orgBId,
          name: `Silver ${RUN_ID}`,
          level: 1,
          pointsThreshold: 0,
          benefits: '[]',
        },
      }),
    ]);

    tierAId = tierA.id;
    tierBId = tierB.id;

    const [memberA, memberB] = await Promise.all([
      db.member.create({
        data: {
          orgId: orgAId,
          tierId: tierAId,
          growthPoints: 0,
        },
      }),
      db.member.create({
        data: {
          orgId: orgBId,
          tierId: tierBId,
          growthPoints: 0,
        },
      }),
    ]);

    memberAId = memberA.id;
    memberBId = memberB.id;
  });

  afterAll(async () => {
    const fulfillmentIds = [fulfillmentId].filter(Boolean);
    await withMysqlRetry(() => db.printableReceipt.deleteMany({ where: { fulfillmentRequestId: { in: fulfillmentIds } } }).then(() => undefined));
    await withMysqlRetry(() => db.growthPointTransaction.deleteMany({ where: { memberId: { in: [memberAId, memberBId].filter(Boolean) } } }).then(() => undefined));
    await withMysqlRetry(() => db.fulfillmentLineItem.deleteMany({ where: { requestId: { in: fulfillmentIds } } }).then(() => undefined));
    await withMysqlRetry(() => db.fulfillmentRequest.deleteMany({ where: { id: { in: fulfillmentIds } } }).then(() => undefined));
    await withMysqlRetry(() => db.idempotencyRecord.deleteMany({ where: { key: { contains: RUN_ID } } }).then(() => undefined));
    await withMysqlRetry(() => db.member.deleteMany({ where: { id: { in: [memberAId, memberBId].filter(Boolean) } } }).then(() => undefined));
    await withMysqlRetry(() => db.membershipTier.deleteMany({ where: { id: { in: [tierAId, tierBId].filter(Boolean) } } }).then(() => undefined));
    await withMysqlRetry(() => db.organization.deleteMany({ where: { id: { in: [orgAId, orgBId].filter(Boolean) } } }).then(() => undefined));
  });

  it('creates fulfillment once and replays same object for same body idempotency key', async () => {
    const app = buildApp();
    const body = {
      memberId: memberAId,
      idempotencyKey: `fulfill-${RUN_ID}`,
      lineItems: [
        {
          description: 'Notebook pack',
          unitPrice: 12.5,
          quantity: 2,
          itemCategory: 'supplies',
        },
      ],
      useWallet: false,
    };

    const res1 = await request(app)
      .post(`/api/orgs/${orgAId}/fulfillments`)
      .set('Authorization', authHeader({ orgId: orgAId }))
      .set('X-Idempotency-Key', `http-${RUN_ID}`)
      .send(body);

    const res2 = await request(app)
      .post(`/api/orgs/${orgAId}/fulfillments`)
      .set('Authorization', authHeader({ orgId: orgAId }))
      .set('X-Idempotency-Key', `http-${RUN_ID}-2`)
      .send(body);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.success).toBe(true);
    expect(res2.body.success).toBe(true);
    expect(res1.body.data.id).toBe(res2.body.data.id);
    expect(res1.body.data.orgId).toBe(orgAId);
    fulfillmentId = res1.body.data.id as string;

    expect(Number(res1.body.data.finalAmount)).toBe(25);
    expect(Array.isArray(res1.body.data.lineItems)).toBe(true);
    expect(res1.body.data.lineItems).toHaveLength(1);

    const records = await db.fulfillmentRequest.findMany({
      where: { orgId: orgAId, idempotencyKey: `fulfill-${RUN_ID}` },
    });
    expect(records).toHaveLength(1);
  });

  it('returns fulfillment detail for same org and 404 for cross-org token', async () => {
    const app = buildApp();

    const sameOrg = await request(app)
      .get(`/api/members/fulfillments/${fulfillmentId}`)
      .set('Authorization', authHeader({ orgId: orgAId }));

    expect(sameOrg.status).toBe(200);
    expect(sameOrg.body.success).toBe(true);
    expect(sameOrg.body.data.id).toBe(fulfillmentId);

    const crossOrg = await request(app)
      .get(`/api/members/fulfillments/${fulfillmentId}`)
      .set('Authorization', authHeader({ orgId: orgBId }));

    expect(crossOrg.status).toBe(404);
    expect(crossOrg.body.error?.code).toBe('NOT_FOUND');
  });

  it('enforces org boundary at org-scoped route level for fulfillment create', async () => {
    const app = buildApp();

    const res = await request(app)
      .post(`/api/orgs/${orgAId}/fulfillments`)
      .set('Authorization', authHeader({ orgId: orgBId }))
      .send({
        memberId: memberBId,
        idempotencyKey: `cross-org-${RUN_ID}`,
        lineItems: [{ description: 'Ruler', unitPrice: 2.5, quantity: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});
