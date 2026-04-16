import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { logisticsOrgRouter, logisticsShipmentRouter } from '../../src/modules/logistics/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `logistics-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-logistics-integration';

let orgAId = '';
let orgBId = '';
let warehouseAId = '';
let warehouseBId = '';
let carrierAId = '';
let carrierBId = '';
let shipmentAId = '';
let shipmentBId = '';

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
  app.use('/api/shipments', logisticsShipmentRouter);
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

describe('DB-backed API integration: logistics shipments', () => {
  beforeAll(async () => {
    const [orgA, orgB] = await Promise.all([
      db.organization.create({
        data: {
          name: `Logistics Org A ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
      db.organization.create({
        data: {
          name: `Logistics Org B ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
    ]);

    orgAId = orgA.id;
    orgBId = orgB.id;

    const [warehouseA, warehouseB, carrierA, carrierB] = await Promise.all([
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
    ]);

    warehouseAId = warehouseA.id;
    warehouseBId = warehouseB.id;
    carrierAId = carrierA.id;
    carrierBId = carrierB.id;

    const seededShipmentB = await db.shipment.create({
      data: {
        warehouseId: warehouseBId,
        carrierId: carrierBId,
        status: 'pending',
        trackingNumber: `TRK-B-${RUN_ID}`,
      },
    });
    shipmentBId = seededShipmentB.id;
  });

  afterAll(async () => {
    await withMysqlRetry(() => db.idempotencyRecord.deleteMany({ where: { key: { contains: RUN_ID } } }).then(() => undefined));
    await withMysqlRetry(() => db.trackingUpdate.deleteMany({ where: { shipmentId: { in: [shipmentAId, shipmentBId].filter(Boolean) } } }).then(() => undefined));
    await withMysqlRetry(() => db.parcel.deleteMany({ where: { shipmentId: { in: [shipmentAId, shipmentBId].filter(Boolean) } } }).then(() => undefined));
    await withMysqlRetry(() => db.shipment.deleteMany({ where: { id: { in: [shipmentAId, shipmentBId].filter(Boolean) } } }).then(() => undefined));
    await withMysqlRetry(() => db.carrier.deleteMany({ where: { id: { in: [carrierAId, carrierBId].filter(Boolean) } } }).then(() => undefined));
    await withMysqlRetry(() => db.warehouse.deleteMany({ where: { id: { in: [warehouseAId, warehouseBId].filter(Boolean) } } }).then(() => undefined));
    await withMysqlRetry(() => db.organization.deleteMany({ where: { id: { in: [orgAId, orgBId].filter(Boolean) } } }).then(() => undefined));
  });

  it('creates a shipment once and replays the same response for the same idempotency key', async () => {
    const app = buildApp();
    const key = `idem-logistics-${RUN_ID}`;
    const payload = {
      orgId: orgAId,
      warehouseId: warehouseAId,
      carrierId: carrierAId,
      trackingNumber: `TRK-A-${RUN_ID}`,
      parcels: [{ description: 'Math books', weightLb: 2.5, quantity: 2 }],
    };

    const res1 = await request(app)
      .post('/api/shipments')
      .set('Authorization', authHeader({ orgId: orgAId }))
      .set('X-Idempotency-Key', key)
      .send(payload);

    let res2 = await request(app)
      .post('/api/shipments')
      .set('Authorization', authHeader({ orgId: orgAId }))
      .set('X-Idempotency-Key', key)
      .send(payload);

    // The middleware marks a key as "in progress" until response persistence completes.
    // Retry a few times to assert replay semantics rather than race timing.
    for (let i = 0; i < 3 && res2.status === 409; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      res2 = await request(app)
        .post('/api/shipments')
        .set('Authorization', authHeader({ orgId: orgAId }))
        .set('X-Idempotency-Key', key)
        .send(payload);
    }

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.success).toBe(true);
    expect(res2.body.success).toBe(true);
    shipmentAId = res1.body.data.id as string;

    expect(res1.body.data.id).toBe(res2.body.data.id);
    expect(res1.body.data.parcels).toHaveLength(1);

    const created = await db.shipment.findMany({
      where: { warehouseId: warehouseAId, carrierId: carrierAId, trackingNumber: `TRK-A-${RUN_ID}` },
    });
    expect(created).toHaveLength(1);
  });

  it('records tracking update and transitions shipment state to delivered', async () => {
    const app = buildApp();

    let updateRes = await request(app)
      .post(`/api/shipments/${shipmentAId}/tracking`)
      .set('Authorization', authHeader({ orgId: orgAId }))
      .set('X-Idempotency-Key', `idem-track-${RUN_ID}`)
      .send({ status: 'delivered', location: 'Dock 3' });

    // Retry transient deadlocks/write conflicts from MySQL under integration load.
    for (let i = 0; i < 3 && updateRes.status === 500; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      updateRes = await request(app)
        .post(`/api/shipments/${shipmentAId}/tracking`)
        .set('Authorization', authHeader({ orgId: orgAId }))
        .set('X-Idempotency-Key', `idem-track-${RUN_ID}`)
        .send({ status: 'delivered', location: 'Dock 3' });
    }

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);

    const getRes = await request(app)
      .get(`/api/shipments/${shipmentAId}`)
      .set('Authorization', authHeader({ orgId: orgAId }));

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.status).toBe('delivered');
    expect(Array.isArray(getRes.body.data.trackingUpdates)).toBe(true);
    expect(getRes.body.data.trackingUpdates[0].status).toBe('delivered');
    expect(getRes.body.data.trackingUpdates[0].source).toBe('manual');
  });

  it('hides cross-org shipments behind 404 in real API path', async () => {
    const app = buildApp();

    const res = await request(app)
      .get(`/api/shipments/${shipmentAId}`)
      .set('Authorization', authHeader({ orgId: orgBId }));

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('lists only same-org shipments for org-scoped listing', async () => {
    const app = buildApp();

    const res = await request(app)
      .get(`/api/orgs/${orgAId}/shipments`)
      .set('Authorization', authHeader({ orgId: orgAId }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.shipments)).toBe(true);
    expect(res.body.data.shipments).toHaveLength(1);
    expect(res.body.data.shipments[0].id).toBe(shipmentAId);
  });
});
