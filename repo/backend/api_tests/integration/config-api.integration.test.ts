import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { configRouter } from '../../src/modules/configuration/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';
import { _resetOverrides } from '../../src/modules/configuration/repository.js';

const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-config-api-integration';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'config-int-user',
      username: 'config-int',
      roles: ['Administrator'],
      permissions: ['read:configuration:*', 'write:configuration:*'],
      orgId: '00000000-0000-0000-0000-000000000001',
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/config', configRouter);
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  _resetOverrides();
});

describe('No-mock HTTP integration: config routes', () => {
  it('GET /api/config returns current config envelope', async () => {
    const app = buildApp();

    const res = await request(app)
      .get('/api/config')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('config');
    expect(res.body.data).toHaveProperty('updatedAt');
    expect(res.body.data.config).toHaveProperty('heartbeatFreshnessSeconds');
  });

  it('PATCH /api/config updates runtime config for Administrator', async () => {
    const app = buildApp();

    const res = await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ heartbeatFreshnessSeconds: 120, parkingEscalationMinutes: 20 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.config.heartbeatFreshnessSeconds).toBe(120);
    expect(res.body.data.config.parkingEscalationMinutes).toBe(20);
  });

  it('PATCH /api/config returns 403 for non-Administrator role', async () => {
    const app = buildApp();

    const res = await request(app)
      .patch('/api/config')
      .set(
        'Authorization',
        authHeader({ roles: ['OpsManager'], permissions: ['read:configuration:*'] }),
      )
      .send({ heartbeatFreshnessSeconds: 240 });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});
