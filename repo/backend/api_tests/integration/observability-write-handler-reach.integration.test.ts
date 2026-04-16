import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { observabilityRouter } from '../../src/modules/observability/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';
import { signRequest } from '../../src/common/signing/api-signer.js';

const RUN_ID = `observability-write-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-observability-write-int';
const signingSecret = process.env['INTEGRATION_SIGNING_SECRET'] ?? 'test-integration-secret-runner-32chars';

let userId = '';
let thresholdId = '';
let alertEventId = '';
let notificationId = '';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId,
      username: `observability-user-${RUN_ID}`,
      roles: ['Administrator', 'OpsManager'],
      permissions: ['read:observability:*', 'write:observability:*'],
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

describe('No-mock HTTP integration: observability write handler reach', () => {
  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        username: `observability-write-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Observability Write Integration User',
        isActive: true,
      },
    });
    userId = user.id;

    const threshold = await db.alertThreshold.create({
      data: {
        metricName: `cpu_utilization_${RUN_ID}`,
        operator: 'gt',
        thresholdValue: 80,
      },
    });
    thresholdId = threshold.id;

    const alert = await db.alertEvent.create({
      data: {
        thresholdId,
        metricValue: 92,
      },
    });
    alertEventId = alert.id;

    const notification = await db.notificationEvent.create({
      data: {
        alertEventId,
        type: 'banner',
        message: `Notification ${RUN_ID}`,
      },
    });
    notificationId = notification.id;
  });

  afterAll(async () => {
    if (notificationId) await db.notificationEvent.deleteMany({ where: { id: notificationId } });
    if (alertEventId) await db.alertEvent.deleteMany({ where: { id: alertEventId } });
    if (thresholdId) await db.alertThreshold.deleteMany({ where: { id: thresholdId } });
    await db.runtimeMetric.deleteMany({ where: { metricName: `cpu_utilization_${RUN_ID}` } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
  });

  it('POST /metrics accepts valid signed requests without mocks', async () => {
    const app = buildApp();
    const body = {
      metricName: `cpu_utilization_${RUN_ID}`,
      value: 72.5,
      unit: 'percent',
    };
    const timestampMs = Date.now();
    const signature = signRequest(JSON.stringify(body), signingSecret, timestampMs);

    const res = await request(app)
      .post('/api/observability/metrics')
      .set('X-Timestamp', String(timestampMs))
      .set('X-Signature', signature)
      .set('X-Idempotency-Key', `obs-metric-${RUN_ID}`)
      .send(body);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);

    const persistedMetric = await db.runtimeMetric.findFirst({
      where: { metricName: `cpu_utilization_${RUN_ID}` },
      orderBy: { collectedAt: 'desc' },
    });
    expect(persistedMetric).toBeTruthy();
    expect(Number(persistedMetric!.value)).toBe(72.5);
  });

  it('threshold and alert/notification write handlers are reached', async () => {
    const app = buildApp();

    const createThresholdRes = await request(app)
      .post('/api/observability/thresholds')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `obs-th-create-${RUN_ID}`)
      .send({
        metricName: `cpu_utilization_${RUN_ID}`,
        operator: 'gt',
        thresholdValue: 90,
      });

    expect(createThresholdRes.status).toBe(201);
    const createdThresholdId = createThresholdRes.body.data.id as string;
    const createdThreshold = await db.alertThreshold.findUnique({ where: { id: createdThresholdId } });
    expect(createdThreshold?.metricName).toBe(`cpu_utilization_${RUN_ID}`);
    expect(Number(createdThreshold?.thresholdValue)).toBe(90);

    const patchRes = await request(app)
      .patch(`/api/observability/thresholds/${createdThresholdId}`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `obs-th-patch-${RUN_ID}`)
      .send({ thresholdValue: 88 });

    expect(patchRes.status).toBe(200);
    const patchedThreshold = await db.alertThreshold.findUnique({ where: { id: createdThresholdId } });
    expect(Number(patchedThreshold?.thresholdValue)).toBe(88);

    const deleteRes = await request(app)
      .delete(`/api/observability/thresholds/${createdThresholdId}`)
      .set('Authorization', authHeader());

    expect(deleteRes.status).toBe(204);
    const deletedThreshold = await db.alertThreshold.findUnique({ where: { id: createdThresholdId } });
    expect(deletedThreshold).toBeNull();

    const ackAlertRes = await request(app)
      .post(`/api/observability/alerts/${alertEventId}/acknowledge`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `obs-alert-ack-${RUN_ID}`)
      .send({});

    expect(ackAlertRes.status).toBe(200);
    const acknowledgedAlert = await db.alertEvent.findUnique({ where: { id: alertEventId } });
    expect(acknowledgedAlert?.acknowledgedAt).toBeTruthy();
    expect(acknowledgedAlert?.acknowledgedByUserId).toBe(userId);

    const readNotificationRes = await request(app)
      .post(`/api/observability/notifications/${notificationId}/read`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `obs-notif-read-${RUN_ID}`)
      .send({});

    expect(readNotificationRes.status).toBe(200);
    const readNotification = await db.notificationEvent.findUnique({ where: { id: notificationId } });
    expect(readNotification?.readAt).toBeTruthy();
  });
});
