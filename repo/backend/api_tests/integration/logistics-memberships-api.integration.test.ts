import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { logisticsOrgRouter } from '../../src/modules/logistics/routes.js';
import { membershipsOrgRouter } from '../../src/modules/memberships/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `api-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-integration-suite';

let orgAId = '';
let orgBId = '';
let warehouseAId = '';
let warehouseBId = '';
let carrierAId = '';
let carrierBId = '';
let shipmentAId = '';
let shipmentBId = '';
let tierAId = '';
let tierBId = '';
let memberAId = '';
let memberBId = '';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'integration-user-1',
      username: 'integration-user',
      roles: ['OpsManager'],
      permissions: ['read:logistics:*', 'read:memberships:*'],
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
  app.use('/api/orgs/:orgId', membershipsOrgRouter);
  app.use(errorHandler);
  return app;
}

describe('DB-backed API integration: logistics + memberships', () => {
  beforeAll(async () => {
    const [orgA, orgB] = await Promise.all([
      db.organization.create({
        data: {
          name: `Integration Org A ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
      db.organization.create({
        data: {
          name: `Integration Org B ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
    ]);

    orgAId = orgA.id;
    orgBId = orgB.id;

    const [warehouseA, warehouseB, carrierA, carrierB, tierA, tierB] = await Promise.all([
      db.warehouse.create({
        data: { orgId: orgAId, name: `Warehouse A ${RUN_ID}`, address: 'A Lane' },
      }),
      db.warehouse.create({
        data: { orgId: orgBId, name: `Warehouse B ${RUN_ID}`, address: 'B Lane' },
      }),
      db.carrier.create({
        data: {
          orgId: orgAId,
          name: `Carrier A ${RUN_ID}`,
          connectorType: 'manual',
          connectorConfig: null,
        },
      }),
      db.carrier.create({
        data: {
          orgId: orgBId,
          name: `Carrier B ${RUN_ID}`,
          connectorType: 'manual',
          connectorConfig: null,
        },
      }),
      db.membershipTier.create({
        data: {
          orgId: orgAId,
          name: `Tier A ${RUN_ID}`,
          level: 1,
          pointsThreshold: 0,
          benefits: '[]',
        },
      }),
      db.membershipTier.create({
        data: {
          orgId: orgBId,
          name: `Tier B ${RUN_ID}`,
          level: 1,
          pointsThreshold: 0,
          benefits: '[]',
        },
      }),
    ]);

    warehouseAId = warehouseA.id;
    warehouseBId = warehouseB.id;
    carrierAId = carrierA.id;
    carrierBId = carrierB.id;
    tierAId = tierA.id;
    tierBId = tierB.id;

    const [shipmentA, shipmentB, memberA, memberB] = await Promise.all([
      db.shipment.create({
        data: {
          warehouseId: warehouseAId,
          carrierId: carrierAId,
          status: 'pending',
          trackingNumber: `TRK-A-${RUN_ID}`,
        },
      }),
      db.shipment.create({
        data: {
          warehouseId: warehouseBId,
          carrierId: carrierBId,
          status: 'pending',
          trackingNumber: `TRK-B-${RUN_ID}`,
        },
      }),
      db.member.create({
        data: {
          orgId: orgAId,
          tierId: tierAId,
          growthPoints: 15,
        },
      }),
      db.member.create({
        data: {
          orgId: orgBId,
          tierId: tierBId,
          growthPoints: 30,
        },
      }),
    ]);

    shipmentAId = shipmentA.id;
    shipmentBId = shipmentB.id;
    memberAId = memberA.id;
    memberBId = memberB.id;
  });

  afterAll(async () => {
    await db.member.deleteMany({ where: { id: { in: [memberAId, memberBId].filter(Boolean) } } });
    await db.membershipTier.deleteMany({ where: { id: { in: [tierAId, tierBId].filter(Boolean) } } });
    await db.trackingUpdate.deleteMany({ where: { shipmentId: { in: [shipmentAId, shipmentBId].filter(Boolean) } } });
    await db.parcel.deleteMany({ where: { shipmentId: { in: [shipmentAId, shipmentBId].filter(Boolean) } } });
    await db.shipment.deleteMany({ where: { id: { in: [shipmentAId, shipmentBId].filter(Boolean) } } });
    await db.carrier.deleteMany({ where: { id: { in: [carrierAId, carrierBId].filter(Boolean) } } });
    await db.warehouse.deleteMany({ where: { id: { in: [warehouseAId, warehouseBId].filter(Boolean) } } });
    await db.organization.deleteMany({ where: { id: { in: [orgAId, orgBId].filter(Boolean) } } });
  });

  it('lists only same-org shipments via real DB-backed API path', async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/api/orgs/${orgAId}/shipments`)
      .set('Authorization', authHeader({ orgId: orgAId, permissions: ['read:logistics:*'] }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.shipments)).toBe(true);
    expect(res.body.data.shipments).toHaveLength(1);
    expect(res.body.data.shipments[0].id).toBe(shipmentAId);
  });

  it('denies cross-org shipment list access with 404', async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/api/orgs/${orgAId}/shipments`)
      .set('Authorization', authHeader({ orgId: orgBId, permissions: ['read:logistics:*'] }));

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('lists only same-org members via real DB-backed API path', async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/api/orgs/${orgAId}/members`)
      .set('Authorization', authHeader({ orgId: orgAId, permissions: ['read:memberships:*'] }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.members)).toBe(true);
    expect(res.body.data.members).toHaveLength(1);
    expect(res.body.data.members[0].id).toBe(memberAId);
  });

  it('enforces memberships read permission in DB-backed API path', async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/api/orgs/${orgAId}/members`)
      .set('Authorization', authHeader({ orgId: orgAId, permissions: ['read:logistics:*'] }));

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});
