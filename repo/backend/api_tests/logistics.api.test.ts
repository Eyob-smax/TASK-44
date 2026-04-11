import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { logisticsShipmentRouter, logisticsOrgRouter } from '../src/modules/logistics/routes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { NotFoundError, ValidationError } from '../src/common/errors/app-errors.js';

vi.mock('../src/modules/logistics/service.js', () => ({
  calculateFee: vi.fn(),
  createShipment: vi.fn(),
  recordTrackingUpdate: vi.fn(),
  getShipmentWithDetails: vi.fn(),
}));

vi.mock('../src/modules/logistics/repository.js', () => ({
  createWarehouse: vi.fn(),
  findWarehouseById: vi.fn(),
  listWarehouses: vi.fn().mockResolvedValue([]),
  createCarrier: vi.fn(),
  findCarrierById: vi.fn(),
  listCarriers: vi.fn().mockResolvedValue([]),
  createDeliveryZone: vi.fn(),
  addNonServiceableZip: vi.fn(),
  isZipServiceable: vi.fn().mockResolvedValue(true),
  createShippingFeeTemplate: vi.fn(),
  listShippingFeeTemplates: vi.fn().mockResolvedValue([]),
  findTemplateByRegionAndTier: vi.fn(),
  createShipment: vi.fn(),
  findShipmentById: vi.fn(),
  listShipments: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  updateShipmentStatus: vi.fn(),
  addTrackingUpdate: vi.fn(),
  upsertSyncCursor: vi.fn(),
  findSyncCursorByCarrier: vi.fn(),
}));

vi.mock('../src/common/middleware/idempotency.js', () => ({
  idempotency: (_req: any, _res: any, next: any) => next(),
}));

const { createShipment, recordTrackingUpdate, getShipmentWithDetails } = await import('../src/modules/logistics/service.js');
const { findShipmentById } = await import('../src/modules/logistics/repository.js');
const { config } = await import('../src/app/config.js');

const jwtSecret = config.JWT_SECRET;
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const SHIPMENT_ID = '00000000-0000-0000-0000-000000000010';

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
      permissions: ['write:logistics:*', 'read:logistics:*'],
      orgId: ORG_ID,
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

const mockShipment = {
  id: SHIPMENT_ID,
  orgId: ORG_ID,
  warehouseId: '00000000-0000-0000-0000-000000000020',
  carrierId: '00000000-0000-0000-0000-000000000030',
  warehouse: { orgId: ORG_ID },
  status: 'pending',
  parcels: [{ id: 'parcel-1', shipmentId: SHIPMENT_ID, weight: 2.5 }],
  trackingUpdates: [],
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orgs/:orgId', logisticsOrgRouter);
  app.use('/api/shipments', logisticsShipmentRouter);
  app.use(errorHandler);
  return app;
}

describe('POST /api/shipments', () => {
  beforeEach(() => vi.clearAllMocks());

  const validBody = {
    orgId: ORG_ID,
    warehouseId: '00000000-0000-0000-0000-000000000001',
    carrierId: '00000000-0000-0000-0000-000000000002',
    recipientName: 'Jane Doe',
    recipientAddress: '123 Main St',
    recipientCity: 'Springfield',
    recipientZip: '12345',
    parcels: [{ weightLb: 2.5, lengthCm: 30, widthCm: 20, heightCm: 15, description: 'Books' }],
  };

  it('returns 201 and creates shipment with parcels', async () => {
    vi.mocked(createShipment).mockResolvedValue(mockShipment as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', authHeader())
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.parcels).toHaveLength(1);
  });

  it('second call with same idempotency key returns same result', async () => {
    vi.mocked(createShipment).mockResolvedValue(mockShipment as any);

    const app = buildApp();

    const res1 = await request(app)
      .post('/api/shipments')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', 'idem-key-001')
      .send(validBody);

    const res2 = await request(app)
      .post('/api/shipments')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', 'idem-key-001')
      .send(validBody);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(res1.body.data.id);
  });
});

describe('GET /api/shipments/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns shipment with parcels and tracking updates', async () => {
    vi.mocked(findShipmentById).mockResolvedValue({
      ...mockShipment,
      trackingUpdates: [{ id: 'track-1', status: 'in_transit', location: 'Chicago', recordedAt: new Date() }],
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get(`/api/shipments/${SHIPMENT_ID}`)
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.parcels).toHaveLength(1);
  });

  it('returns 404 when shipment not found', async () => {
    vi.mocked(findShipmentById).mockResolvedValue(null as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/shipments/00000000-0000-0000-0000-000000000099')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
  });
});

describe('POST /api/shipments/:id/tracking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and adds tracking update', async () => {
    vi.mocked(recordTrackingUpdate).mockResolvedValue(undefined as any);
    vi.mocked(findShipmentById).mockResolvedValue(mockShipment as any);

    const app = buildApp();
    const res = await request(app)
      .post(`/api/shipments/${SHIPMENT_ID}/tracking`)
      .set('Authorization', authHeader())
      .send({ status: 'in_transit', location: 'Dallas', source: 'carrier_api' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(recordTrackingUpdate).toHaveBeenCalledWith(SHIPMENT_ID, 'in_transit', 'Dallas', 'carrier_api');
  });

  it('adds delivered tracking update and marks delivered', async () => {
    vi.mocked(recordTrackingUpdate).mockResolvedValue(undefined as any);
    vi.mocked(findShipmentById).mockResolvedValue(mockShipment as any);

    const app = buildApp();
    const res = await request(app)
      .post(`/api/shipments/${SHIPMENT_ID}/tracking`)
      .set('Authorization', authHeader())
      .send({ status: 'delivered', location: 'Front Door' });

    expect(res.status).toBe(200);
    expect(recordTrackingUpdate).toHaveBeenCalledWith(SHIPMENT_ID, 'delivered', 'Front Door', 'manual');
  });
});

describe('GET /api/orgs/:orgId/warehouses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns list of warehouses', async () => {
    const { listWarehouses } = await import('../src/modules/logistics/repository.js');
    vi.mocked(listWarehouses).mockResolvedValue([
      { id: 'wh-1', orgId: ORG_ID, name: 'Main Warehouse' } as any,
    ]);

    const app = buildApp();
    const res = await request(app)
      .get(`/api/orgs/${ORG_ID}/warehouses`)
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/orgs/:orgId/shipments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated shipment list for org', async () => {
    const { listShipments } = await import('../src/modules/logistics/repository.js');
    vi.mocked(listShipments).mockResolvedValue({
      items: [{ id: 'ship-1', status: 'pending', parcels: [] }] as any,
      total: 1,
    });

    const app = buildApp();
    const res = await request(app)
      .get(`/api/orgs/${ORG_ID}/shipments`)
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shipments).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    expect(listShipments).toHaveBeenCalledWith(ORG_ID, expect.any(Object), expect.any(Object));
  });

  it('returns 403 when user lacks read:logistics permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/api/orgs/${ORG_ID}/shipments`)
      .set(
        'Authorization',
        authHeader({ roles: ['Auditor'], permissions: ['read:after-sales:*'] }),
      );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/orgs/:orgId/carriers — LAN URL enforcement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when rest_api connectorConfig contains an external URL', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/orgs/${ORG_ID}/carriers`)
      .set('Authorization', authHeader({ roles: ['Administrator'], permissions: ['write:logistics:*'] }))
      .send({
        name: 'External Carrier',
        connectorType: 'rest_api',
        connectorConfig: JSON.stringify({ apiUrl: 'https://carrier.example.com/api' }),
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 201 when rest_api connectorConfig uses a .lan hostname', async () => {
    const { createCarrier } = await import('../src/modules/logistics/repository.js');
    vi.mocked(createCarrier).mockResolvedValue({
      id: 'car-new',
      orgId: ORG_ID,
      name: 'LAN Carrier',
      connectorType: 'rest_api' as any,
      connectorConfig: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const app = buildApp();
    const res = await request(app)
      .post(`/api/orgs/${ORG_ID}/carriers`)
      .set('Authorization', authHeader({ roles: ['Administrator'], permissions: ['write:logistics:*'] }))
      .send({
        name: 'LAN Carrier',
        connectorType: 'rest_api',
        connectorConfig: JSON.stringify({ apiUrl: 'http://carrier.lan/api' }),
      });
    expect(res.status).toBe(201);
  });
});
