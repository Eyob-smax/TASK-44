import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app/server.js';

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface ValidationCase {
  method: HttpMethod;
  path: string;
  body?: unknown;
}

const app = createApp();
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-full-app-validation-reach';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}): string {
  const token = jwt.sign(
    {
      userId: 'validation-reach-user',
      username: 'validation-reach-admin',
      roles: ['Administrator'],
      permissions: [
        'read:master-data:*',
        'write:master-data:*',
        'read:classroom-ops:*',
        'write:classroom-ops:*',
        'read:parking:*',
        'write:parking:*',
        'read:logistics:*',
        'write:logistics:*',
        'read:after-sales:*',
        'write:after-sales:*',
        'read:memberships:*',
        'write:memberships:*',
        'read:observability:*',
        'write:observability:*',
        'read:configuration:*',
        'write:configuration:*',
      ],
      orgId: '00000000-0000-0000-0000-000000000001',
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

const invalidBodyCases: ValidationCase[] = [
  { method: 'post', path: '/api/admin/users', body: {} },
  { method: 'post', path: '/api/orgs/org-1/students', body: {} },
  { method: 'post', path: '/api/classroom-ops/heartbeat', body: {} },
  { method: 'post', path: '/api/classroom-ops/confidence', body: {} },
  { method: 'post', path: '/api/classroom-ops/anomalies', body: {} },
  { method: 'post', path: '/api/parking/events', body: {} },
  { method: 'post', path: '/api/parking/exceptions/exc-1/resolve', body: {} },
  { method: 'post', path: '/api/orgs/org-1/warehouses', body: {} },
  { method: 'post', path: '/api/orgs/org-1/carriers', body: {} },
  { method: 'post', path: '/api/orgs/org-1/shipping-fee-templates', body: {} },
  { method: 'post', path: '/api/orgs/org-1/delivery-zones', body: {} },
  { method: 'post', path: '/api/orgs/org-1/non-serviceable-zips', body: {} },
  { method: 'post', path: '/api/shipments', body: {} },
  { method: 'post', path: '/api/orgs/org-1/tickets', body: {} },
  { method: 'post', path: '/api/tickets/ticket-1/timeline', body: {} },
  { method: 'post', path: '/api/tickets/ticket-1/assign', body: {} },
  { method: 'post', path: '/api/tickets/ticket-1/status', body: {} },
  { method: 'post', path: '/api/tickets/ticket-1/compensations/sugg-1/approve', body: {} },
  { method: 'post', path: '/api/orgs/org-1/membership-tiers', body: {} },
  { method: 'post', path: '/api/orgs/org-1/members', body: {} },
  { method: 'post', path: '/api/orgs/org-1/coupons', body: {} },
  { method: 'post', path: '/api/orgs/org-1/fulfillments', body: {} },
  { method: 'post', path: '/api/members/member-1/wallet/topup', body: {} },
  { method: 'post', path: '/api/members/member-1/wallet/spend', body: {} },
];

describe('No-mock full app validation reach integration', () => {
  it('POST /api/auth/login returns VALIDATION_ERROR for invalid body shape', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'demo.admin' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  for (const tc of invalidBodyCases) {
    it(`${tc.method.toUpperCase()} ${tc.path} reaches validation middleware and returns 400`, async () => {
      let req = request(app)[tc.method](tc.path)
        .set('Authorization', authHeader());

      if (tc.body !== undefined) {
        req = req.send(tc.body);
      }

      const res = await req;

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    });
  }

  it('GET /api/parking/exceptions returns VALIDATION_ERROR for invalid query filter', async () => {
    const res = await request(app)
      .get('/api/parking/exceptions?type=not-a-real-type')
      .set('Authorization', authHeader());

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /api/config returns VALIDATION_ERROR for invalid value type', async () => {
    const res = await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ heartbeatFreshnessSeconds: 'bad' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});
