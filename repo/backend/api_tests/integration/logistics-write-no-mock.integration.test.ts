import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { logisticsOrgRouter } from '../../src/modules/logistics/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `logistics-write-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-logistics-write-int';

let orgId = '';
let userId = '';
let warehouseId = '';
let carrierId = '';
let shippingTemplateId = '';
let deliveryZoneId = '';

function authHeader() {
  const token = jwt.sign(
    {
      userId,
      username: `logistics-write-${RUN_ID}`,
      roles: ['Administrator'],
      permissions: ['read:logistics:*', 'write:logistics:*'],
      orgId,
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

describe('No-mock HTTP integration: logistics write endpoints', () => {
  beforeAll(async () => {
    const org = await db.organization.create({
      data: {
        name: `Logistics Write Org ${RUN_ID}`,
        type: 'district',
        timezone: 'UTC',
      },
    });
    orgId = org.id;

    const user = await db.user.create({
      data: {
        username: `logistics_write_${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Logistics Write Integration User',
        isActive: true,
        orgId,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await db.idempotencyRecord.deleteMany({ where: { key: { contains: RUN_ID } } });
    await db.nonServiceableZip.deleteMany({ where: { orgId } });
    if (deliveryZoneId) {
      await db.deliveryZone.deleteMany({ where: { id: deliveryZoneId } });
    }
    if (shippingTemplateId) {
      await db.shippingFeeSurcharge.deleteMany({ where: { templateId: shippingTemplateId } });
      await db.shippingFeeTemplate.deleteMany({ where: { id: shippingTemplateId } });
    }
    if (carrierId) {
      await db.carrier.deleteMany({ where: { id: carrierId } });
    }
    if (warehouseId) {
      await db.warehouse.deleteMany({ where: { id: warehouseId } });
    }
    if (userId) {
      await db.user.deleteMany({ where: { id: userId } });
    }
    if (orgId) {
      await db.organization.deleteMany({ where: { id: orgId } });
    }
  });

  it('covers org-scoped logistics write handlers with real repository path', async () => {
    const app = buildApp();

    const warehouseRes = await request(app)
      .post(`/api/orgs/${orgId}/warehouses`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `logistics-warehouse-${RUN_ID}`)
      .send({
        name: `Warehouse ${RUN_ID}`,
        address: 'Main Building',
      });

    expect(warehouseRes.status).toBe(201);
    expect(warehouseRes.body.success).toBe(true);
    warehouseId = warehouseRes.body.data.id as string;
    const persistedWarehouse = await db.warehouse.findUnique({ where: { id: warehouseId } });
    expect(persistedWarehouse?.orgId).toBe(orgId);
    expect(persistedWarehouse?.name).toContain('Warehouse');

    const carrierRes = await request(app)
      .post(`/api/orgs/${orgId}/carriers`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `logistics-carrier-${RUN_ID}`)
      .send({
        name: `Carrier ${RUN_ID}`,
        connectorType: 'manual',
      });

    expect(carrierRes.status).toBe(201);
    expect(carrierRes.body.success).toBe(true);
    carrierId = carrierRes.body.data.id as string;
    const persistedCarrier = await db.carrier.findUnique({ where: { id: carrierId } });
    expect(persistedCarrier?.orgId).toBe(orgId);
    expect(persistedCarrier?.connectorType).toBe('manual');

    const templateRes = await request(app)
      .post(`/api/orgs/${orgId}/shipping-fee-templates`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `logistics-template-${RUN_ID}`)
      .send({
        name: `Standard ${RUN_ID}`,
        baseFee: 5,
        baseWeightLb: 2,
        perAdditionalLbFee: 1,
        regionCode: '123',
        tier: 'standard',
        minItems: 1,
        surcharges: [{ condition: 'oversize', surchargeAmount: 3 }],
      });

    expect(templateRes.status).toBe(201);
    expect(templateRes.body.success).toBe(true);
    shippingTemplateId = templateRes.body.data.id as string;
    const persistedTemplate = await db.shippingFeeTemplate.findUnique({ where: { id: shippingTemplateId } });
    expect(persistedTemplate?.orgId).toBe(orgId);
    expect(Number(persistedTemplate?.baseFee)).toBe(5);
    const persistedSurcharges = await db.shippingFeeSurcharge.findMany({ where: { templateId: shippingTemplateId } });
    expect(persistedSurcharges).toHaveLength(1);

    const zoneRes = await request(app)
      .post(`/api/orgs/${orgId}/delivery-zones`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `logistics-zone-${RUN_ID}`)
      .send({
        name: `Zone ${RUN_ID}`,
        regionCode: '123',
        zipPatterns: ['123*', '124*'],
      });

    expect(zoneRes.status).toBe(201);
    expect(zoneRes.body.success).toBe(true);
    deliveryZoneId = zoneRes.body.data.id as string;
    const persistedZone = await db.deliveryZone.findUnique({ where: { id: deliveryZoneId } });
    expect(persistedZone?.orgId).toBe(orgId);
    expect((persistedZone?.zipPatterns ?? '').includes('123*')).toBe(true);

    const nonServiceableZipRes = await request(app)
      .post(`/api/orgs/${orgId}/non-serviceable-zips`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `logistics-zip-${RUN_ID}`)
      .send({
        zipCode: '12345',
        reason: 'Road closure',
      });

    expect(nonServiceableZipRes.status).toBe(201);
    expect(nonServiceableZipRes.body.success).toBe(true);
    expect(nonServiceableZipRes.body.data.zipCode).toBe('12345');
    const persistedZip = await db.nonServiceableZip.findFirst({ where: { orgId, zipCode: '12345' } });
    expect(persistedZip).toBeTruthy();

    const [warehousesRes, carriersRes, templatesRes] = await Promise.all([
      request(app).get(`/api/orgs/${orgId}/warehouses`).set('Authorization', authHeader()),
      request(app).get(`/api/orgs/${orgId}/carriers`).set('Authorization', authHeader()),
      request(app).get(`/api/orgs/${orgId}/shipping-fee-templates`).set('Authorization', authHeader()),
    ]);
    expect(warehousesRes.status).toBe(200);
    expect(carriersRes.status).toBe(200);
    expect(templatesRes.status).toBe(200);
    expect(warehousesRes.body.data.some((w: { id: string }) => w.id === warehouseId)).toBe(true);
    expect(carriersRes.body.data.some((c: { id: string }) => c.id === carrierId)).toBe(true);
    expect(templatesRes.body.data.some((t: { id: string }) => t.id === shippingTemplateId)).toBe(true);
  });
});
