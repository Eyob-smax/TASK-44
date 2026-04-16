import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { logisticsOrgRouter } from '../../src/modules/logistics/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `logistics-calc-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-logistics-calc-integration';

let orgAId = '';
let orgBId = '';
let templateId = '';
let surchargeId = '';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'logistics-calc-int-user',
      username: 'logistics-calc-int',
      roles: ['OpsManager'],
      permissions: ['read:logistics:*', 'write:logistics:*'],
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
  app.use('/api/orgs/:orgId', logisticsOrgRouter);
  app.use(errorHandler);
  return app;
}

describe('DB-backed API integration: logistics shipping fee calculate endpoint', () => {
  beforeAll(async () => {
    const [orgA, orgB] = await Promise.all([
      db.organization.create({
        data: {
          name: `Logistics Calc Org A ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
      db.organization.create({
        data: {
          name: `Logistics Calc Org B ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
    ]);

    orgAId = orgA.id;
    orgBId = orgB.id;

    const template = await db.shippingFeeTemplate.create({
      data: {
        orgId: orgAId,
        name: `Standard CA ${RUN_ID}`,
        baseFee: 5,
        baseWeightLb: 2,
        perAdditionalLbFee: 1,
        regionCode: 'CA',
        tier: 'standard',
        minItems: 1,
      },
    });

    templateId = template.id;

    const surcharge = await db.shippingFeeSurcharge.create({
      data: {
        templateId,
        condition: 'oversize',
        surchargeAmount: 3,
      },
    });

    surchargeId = surcharge.id;
  });

  afterAll(async () => {
    await db.shippingFeeSurcharge.deleteMany({ where: { id: surchargeId } });
    await db.shippingFeeTemplate.deleteMany({ where: { id: templateId } });
    await db.organization.deleteMany({ where: { id: { in: [orgAId, orgBId].filter(Boolean) } } });
  });

  it('GET /api/orgs/:orgId/shipping-fee-templates/calculate returns computed fee', async () => {
    const app = buildApp();

    const res = await request(app)
      .get(`/api/orgs/${orgAId}/shipping-fee-templates/calculate?regionCode=CA&tier=standard&weightLb=4.5&itemCount=2&surcharges=oversize`)
      .set('Authorization', authHeader({ orgId: orgAId }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.totalFee)).toBe(10.5);
    expect(Array.isArray(res.body.data.breakdown)).toBe(true);
  });

  it('GET /api/orgs/:orgId/shipping-fee-templates/calculate returns 404 when no template matches', async () => {
    const app = buildApp();

    const res = await request(app)
      .get(`/api/orgs/${orgAId}/shipping-fee-templates/calculate?regionCode=NY&tier=standard&weightLb=2&itemCount=1`)
      .set('Authorization', authHeader({ orgId: orgAId }));

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('GET /api/orgs/:orgId/shipping-fee-templates/calculate enforces org boundary with 404', async () => {
    const app = buildApp();

    const res = await request(app)
      .get(`/api/orgs/${orgAId}/shipping-fee-templates/calculate?regionCode=CA&tier=standard&weightLb=2&itemCount=1`)
      .set('Authorization', authHeader({ orgId: orgBId }));

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});
