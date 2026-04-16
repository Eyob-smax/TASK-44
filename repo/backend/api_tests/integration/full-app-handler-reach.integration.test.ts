import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app/server.js';

const app = createApp();
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-full-app-handler-reach';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'handler-reach-user',
      username: 'handler-reach-admin',
      roles: ['Administrator'],
      permissions: [
        'read:master-data:*',
        'read:classroom-ops:*',
        'read:parking:*',
        'read:logistics:*',
        'read:after-sales:*',
        'read:memberships:*',
        'read:observability:*',
        'write:observability:*',
        'read:configuration:*',
        'write:configuration:*',
        'read:backups:*',
      ],
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

describe('No-mock full app handler reach integration', () => {
  it('GET /api/orgs/:orgId/students/:id reaches master-data handler and returns not found for missing student', async () => {
    const res = await request(app)
      .get('/api/orgs/org-handler-reach/students/00000000-0000-0000-0000-000000000001')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/classroom-ops/anomalies/:id reaches classroom-ops handler and returns not found for missing anomaly', async () => {
    const res = await request(app)
      .get('/api/classroom-ops/anomalies/00000000-0000-0000-0000-000000000002')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/parking/exceptions/:id reaches parking handler and returns not found for missing exception', async () => {
    const res = await request(app)
      .get('/api/parking/exceptions/00000000-0000-0000-0000-000000000003')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/shipments/:id reaches logistics shipment handler and returns not found for missing shipment', async () => {
    const res = await request(app)
      .get('/api/shipments/00000000-0000-0000-0000-000000000004')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/tickets/:id reaches after-sales ticket handler and returns not found for missing ticket', async () => {
    const res = await request(app)
      .get('/api/tickets/00000000-0000-0000-0000-000000000005')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/members/:id reaches memberships handler and returns not found for missing member', async () => {
    const res = await request(app)
      .get('/api/members/00000000-0000-0000-0000-000000000006')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/members/fulfillments/:id reaches memberships fulfillment detail handler and returns not found for missing fulfillment', async () => {
    const res = await request(app)
      .get('/api/members/fulfillments/00000000-0000-0000-0000-000000000007')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/backups/:id reaches backups handler and returns not found for missing backup', async () => {
    const res = await request(app)
      .get('/api/backups/00000000-0000-0000-0000-000000000008')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/files/:id reaches files handler and returns not found for missing file', async () => {
    const res = await request(app)
      .get('/api/files/00000000-0000-0000-0000-000000000009')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/config reaches runtime configuration handler with no mocks', async () => {
    const res = await request(app)
      .get('/api/config')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('config');
  });

  it('GET /api/observability/thresholds reaches observability handler with no mocks', async () => {
    const res = await request(app)
      .get('/api/observability/thresholds')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
