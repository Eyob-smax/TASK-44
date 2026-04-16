import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { NotFoundError } from '../src/common/errors/app-errors.js';

// Set env vars before importing app/config-bound modules.
vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'test-integration-signing-secret-for-observability-tests');

vi.mock('../src/modules/observability/service.js', () => ({
  recordMetric: vi.fn().mockResolvedValue(undefined),
  getMetricsSummary: vi.fn().mockResolvedValue({
    p95Latency: 120,
    cpuUtilization: 45,
    gpuUtilization: 30,
    errorRate: 0.5,
    collectedAt: new Date().toISOString(),
  }),
  searchLogs: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
  createAlertThreshold: vi.fn(),
  listAlertThresholds: vi.fn().mockResolvedValue([]),
  updateAlertThreshold: vi.fn(),
  deleteAlertThreshold: vi.fn(),
  listAlertEvents: vi.fn().mockResolvedValue([]),
  acknowledgeAlertEvent: vi.fn(),
  listNotifications: vi.fn().mockResolvedValue([]),
  markNotificationRead: vi.fn(),
}));

const { observabilityRouter } = await import('../src/modules/observability/routes.js');
const { signRequest } = await import('../src/common/signing/api-signer.js');
const { config } = await import('../src/app/config.js');

const {
  recordMetric,
  getMetricsSummary,
  createAlertThreshold,
  listAlertEvents,
  acknowledgeAlertEvent,
  deleteAlertThreshold,
  listAlertThresholds,
  updateAlertThreshold,
  listNotifications,
  markNotificationRead,
} = await import('../src/modules/observability/service.js');

const jwtSecret = config.JWT_SECRET;

function buildSignedHeaders(payload: unknown, timestampMs = Date.now(), signature?: string) {
  const payloadJson = JSON.stringify(payload ?? {});
  const signed = signature ?? signRequest(
    payloadJson,
    config.INTEGRATION_SIGNING_SECRET,
    timestampMs,
  );
  return {
    'X-Timestamp': String(timestampMs),
    'X-Signature': signed,
  };
}

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
      username: 'test-admin',
      roles: ['Administrator'],
      permissions: ['read:observability:*', 'write:observability:*'],
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
  app.use('/api/observability', observabilityRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/observability/metrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with metrics summary', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/observability/metrics')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      p95Latency: 120,
      cpuUtilization: 45,
    });
  });
});

describe('POST /api/observability/metrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 202 on successful metric ingestion', async () => {
    const payload = { metricName: 'cpu_utilization', value: 75, unit: 'percent' };

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/metrics')
      .set(buildSignedHeaders(payload))
      .send(payload);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(recordMetric).toHaveBeenCalledWith('cpu_utilization', 75, 'percent', undefined);
  });

  it('returns 401 when signing headers are missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/metrics')
      .send({ value: 75 });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(recordMetric).not.toHaveBeenCalled();
  });

  it('returns 401 when signature is invalid', async () => {
    const payload = { metricName: 'cpu_utilization', value: 75, unit: 'percent' };

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/metrics')
      .set(buildSignedHeaders(payload, Date.now(), 'deadbeef'))
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(recordMetric).not.toHaveBeenCalled();
  });

  it('returns 400 when metricName is missing', async () => {
    const payload = { value: 75, unit: 'percent' };

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/metrics')
      .set(buildSignedHeaders(payload))
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(recordMetric).not.toHaveBeenCalled();
  });

  it('returns 400 when value is not a number', async () => {
    const payload = { metricName: 'cpu_utilization', value: 'bad-value', unit: 'percent' };

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/metrics')
      .set(buildSignedHeaders(payload))
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(recordMetric).not.toHaveBeenCalled();
  });

  it('returns 401 when timestamp is older than the 5-minute replay window', async () => {
    const expiredTs = Date.now() - 6 * 60 * 1000; // 6 minutes ago
    const payload = { metricName: 'cpu_utilization', value: 60, unit: 'percent' };

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/metrics')
      .set(buildSignedHeaders(payload, expiredTs))
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(recordMetric).not.toHaveBeenCalled();
  });

  it('returns 401 when timestamp is more than 5 minutes in the future', async () => {
    const futureTs = Date.now() + 6 * 60 * 1000; // 6 minutes from now
    const payload = { metricName: 'cpu_utilization', value: 60, unit: 'percent' };

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/metrics')
      .set(buildSignedHeaders(payload, futureTs))
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(recordMetric).not.toHaveBeenCalled();
  });
});

describe('GET /api/observability/logs', () => {
  it('returns 200 with paginated logs', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/observability/logs')
      .set('Authorization', authHeader())
      .query({ level: 'error', page: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('logs');
    expect(res.body.data).toHaveProperty('total');
  });
});

describe('POST /api/observability/thresholds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 201 with created threshold', async () => {
    vi.mocked(createAlertThreshold).mockResolvedValue({
      id: 'threshold-1',
      metricName: 'cpu_utilization',
      operator: 'gt',
      thresholdValue: 90,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/thresholds')
      .set('Authorization', authHeader())
      .send({ metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 90 });

    expect(res.status).toBe(201);
    expect(res.body.data.metricName).toBe('cpu_utilization');
  });

  it('returns 400 when operator is invalid', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/thresholds')
      .set('Authorization', authHeader())
      .send({ metricName: 'cpu_utilization', operator: 'INVALID', thresholdValue: 90 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/observability/thresholds/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 204 on successful deletion', async () => {
    vi.mocked(deleteAlertThreshold).mockResolvedValue(undefined as any);

    const app = buildApp();
    const res = await request(app)
      .delete('/api/observability/thresholds/threshold-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(204);
  });

  it('returns 404 when threshold does not exist', async () => {
    vi.mocked(deleteAlertThreshold).mockRejectedValue(new NotFoundError('Alert threshold not-found not found'));

    const app = buildApp();
    const res = await request(app)
      .delete('/api/observability/thresholds/not-found')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/observability/alerts', () => {
  it('returns 200 with alert events', async () => {
    vi.mocked(listAlertEvents).mockResolvedValue([
      {
        id: 'alert-1',
        metricName: 'cpu_utilization',
        operator: 'gt',
        thresholdValue: 90,
        metricValue: 95,
        triggeredAt: new Date().toISOString(),
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
    ] as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/observability/alerts')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/observability/alerts/:id/acknowledge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 on successful acknowledgement', async () => {
    vi.mocked(acknowledgeAlertEvent).mockResolvedValue({ id: 'alert-1', acknowledgedAt: new Date() } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/alerts/alert-1/acknowledge')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
      expect(acknowledgeAlertEvent).toHaveBeenCalledWith('alert-1', 'user-1', 'org-1');
  });
});

describe('GET /api/observability/logs permission rejection', () => {
  it('returns 403 when user lacks read:observability permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/observability/logs')
      .set(
        'Authorization',
        authHeader({ roles: ['Viewer'], permissions: ['read:logistics:*'] }),
      );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('Org-scoped data isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes orgId from user token to listAlertEvents', async () => {
    vi.mocked(listAlertEvents).mockResolvedValue([]);

    const app = buildApp();
    await request(app)
      .get('/api/observability/alerts')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(listAlertEvents).toHaveBeenCalledWith(false, 'org-1');
  });
});

describe('GET /api/observability/thresholds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with thresholds list scoped to caller org', async () => {
    vi.mocked(listAlertThresholds).mockResolvedValue([
      { id: 'th-1', metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 90, isActive: true } as any,
    ]);

    const app = buildApp();
    const res = await request(app)
      .get('/api/observability/thresholds')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(listAlertThresholds).toHaveBeenCalledWith('org-1');
  });

  it('returns 403 when user lacks read:observability permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/observability/thresholds')
      .set('Authorization', authHeader({ roles: ['Viewer'], permissions: ['read:logistics:*'] }));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('PATCH /api/observability/thresholds/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with updated threshold for OpsManager', async () => {
    vi.mocked(updateAlertThreshold).mockResolvedValue({
      id: 'th-1',
      metricName: 'cpu_utilization',
      operator: 'gte',
      thresholdValue: 95,
      isActive: true,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .patch('/api/observability/thresholds/th-1')
      .set('Authorization', authHeader({ roles: ['OpsManager'], permissions: ['write:observability:*'] }))
      .send({ thresholdValue: 95, operator: 'gte' });

    expect(res.status).toBe(200);
    expect(res.body.data.thresholdValue).toBe(95);
    expect(updateAlertThreshold).toHaveBeenCalledWith('th-1', expect.objectContaining({ thresholdValue: 95 }), 'org-1');
  });

  it('returns 400 when no fields are provided', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch('/api/observability/thresholds/th-1')
      .set('Authorization', authHeader({ roles: ['OpsManager'], permissions: ['write:observability:*'] }))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when threshold does not exist', async () => {
    vi.mocked(updateAlertThreshold).mockRejectedValue(new NotFoundError('Alert threshold missing-id not found'));

    const app = buildApp();
    const res = await request(app)
      .patch('/api/observability/thresholds/missing-id')
      .set('Authorization', authHeader({ roles: ['Administrator'] }))
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 when role is not Administrator/OpsManager', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch('/api/observability/thresholds/th-1')
      .set('Authorization', authHeader({ roles: ['Auditor'], permissions: ['write:observability:*'] }))
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });
});

describe('Notifications endpoints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /notifications returns 200 with list', async () => {
    vi.mocked(listNotifications).mockResolvedValue([
      { id: 'notif-1', subject: 'CPU spike', readAt: null, createdAt: new Date().toISOString() } as any,
    ]);

    const app = buildApp();
    const res = await request(app)
      .get('/api/observability/notifications')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listNotifications).toHaveBeenCalledWith(false, 'org-1');
  });

  it('GET /notifications forwards unreadOnly=true to service', async () => {
    vi.mocked(listNotifications).mockResolvedValue([]);

    const app = buildApp();
    await request(app)
      .get('/api/observability/notifications?unreadOnly=true')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(listNotifications).toHaveBeenCalledWith(true, 'org-1');
  });

  it('GET /notifications returns 403 when user lacks read:observability permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/observability/notifications')
      .set('Authorization', authHeader({ roles: ['Viewer'], permissions: ['read:logistics:*'] }));

    expect(res.status).toBe(403);
  });

  it('POST /notifications/:id/read returns 200 and marks notification read', async () => {
    vi.mocked(markNotificationRead).mockResolvedValue(undefined as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/notifications/notif-1/read')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(markNotificationRead).toHaveBeenCalledWith('notif-1', 'org-1');
  });

  it('POST /notifications/:id/read returns 404 when notification not found', async () => {
    vi.mocked(markNotificationRead).mockRejectedValue(new NotFoundError('Notification not found'));

    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/notifications/missing-id/read')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /notifications/:id/read returns 403 when user lacks write:observability permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/observability/notifications/notif-1/read')
      .set('Authorization', authHeader({ roles: ['Viewer'], permissions: ['read:observability:*'] }));

    expect(res.status).toBe(403);
  });
});
