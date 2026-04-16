import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app/server.js';
import { config } from '../src/app/config.js';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface NoAuthCase {
  method: Method;
  path: string;
  expectedStatus: number;
  body?: unknown;
}

const app = createApp();
const jwtSecret = config.JWT_SECRET;

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'smoke-user-1',
      username: 'smoke-admin',
      roles: ['Administrator'],
      permissions: [
        'read:configuration:*',
        'write:configuration:*',
      ],
      orgId: 'org-smoke-1',
      ...overrides,
    },
    jwtSecret,
  );

  return `Bearer ${token}`;
}

const noAuthCases: NoAuthCase[] = [
  // Auth and admin
  { method: 'post', path: '/api/auth/logout', expectedStatus: 401 },
  { method: 'get', path: '/api/auth/me', expectedStatus: 401 },
  { method: 'post', path: '/api/admin/users', expectedStatus: 401, body: {} },

  // Master data
  { method: 'get', path: '/api/orgs', expectedStatus: 401 },
  { method: 'get', path: '/api/orgs/org-1', expectedStatus: 401 },
  { method: 'get', path: '/api/orgs/org-1/campuses', expectedStatus: 401 },
  { method: 'get', path: '/api/orgs/org-1/students', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/students', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/students/student-1', expectedStatus: 401 },
  { method: 'patch', path: '/api/orgs/org-1/students/student-1', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/departments', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/departments', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/orgs/org-1/courses', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/semesters', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/semesters', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/orgs/org-1/classes', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/orgs/org-1/import', expectedStatus: 401 },
  { method: 'get', path: '/api/orgs/org-1/import/job-1', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/export', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/export/job-1', expectedStatus: 401 },

  // Classroom ops
  { method: 'post', path: '/api/classroom-ops/heartbeat', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/classroom-ops/confidence', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/classroom-ops/anomalies', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/classroom-ops/anomalies', expectedStatus: 401 },
  { method: 'get', path: '/api/classroom-ops/anomalies/anom-1', expectedStatus: 401 },
  { method: 'post', path: '/api/classroom-ops/anomalies/anom-1/acknowledge', expectedStatus: 401 },
  { method: 'post', path: '/api/classroom-ops/anomalies/anom-1/assign', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/classroom-ops/anomalies/anom-1/resolve', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/classroom-ops/dashboard', expectedStatus: 401 },

  // Parking
  { method: 'post', path: '/api/parking/events', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/parking/facilities', expectedStatus: 401 },
  { method: 'get', path: '/api/parking/facilities/fac-1/status', expectedStatus: 401 },
  { method: 'get', path: '/api/parking/exceptions', expectedStatus: 401 },
  { method: 'get', path: '/api/parking/exceptions/exc-1', expectedStatus: 401 },
  { method: 'post', path: '/api/parking/exceptions/exc-1/resolve', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/parking/exceptions/exc-1/escalate', expectedStatus: 401, body: {} },

  // Logistics
  { method: 'get', path: '/api/orgs/org-1/warehouses', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/warehouses', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/carriers', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/carriers', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/shipping-fee-templates', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/shipping-fee-templates', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/shipping-fee-templates/calculate', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/delivery-zones', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/orgs/org-1/non-serviceable-zips', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/shipments', expectedStatus: 401 },
  { method: 'post', path: '/api/shipments', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/shipments/ship-1', expectedStatus: 401 },
  { method: 'post', path: '/api/shipments/ship-1/tracking', expectedStatus: 401, body: {} },

  // After-sales
  { method: 'post', path: '/api/orgs/org-1/tickets', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/tickets', expectedStatus: 401 },
  { method: 'get', path: '/api/tickets/ticket-1', expectedStatus: 401 },
  { method: 'post', path: '/api/tickets/ticket-1/timeline', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/tickets/ticket-1/assign', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/tickets/ticket-1/status', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/tickets/ticket-1/evidence', expectedStatus: 401 },
  { method: 'post', path: '/api/tickets/ticket-1/suggest-compensation', expectedStatus: 401 },
  {
    method: 'post',
    path: '/api/tickets/ticket-1/compensations/sugg-1/approve',
    expectedStatus: 401,
    body: {},
  },

  // Memberships
  { method: 'post', path: '/api/orgs/org-1/membership-tiers', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/orgs/org-1/membership-tiers', expectedStatus: 401 },
  { method: 'get', path: '/api/orgs/org-1/members', expectedStatus: 401 },
  { method: 'post', path: '/api/orgs/org-1/members', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/orgs/org-1/coupons', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/orgs/org-1/fulfillments', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/members/member-1', expectedStatus: 401 },
  { method: 'get', path: '/api/members/member-1/wallet', expectedStatus: 401 },
  { method: 'post', path: '/api/members/member-1/wallet/topup', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/members/member-1/wallet/spend', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/members/fulfillments/fulfill-1', expectedStatus: 401 },

  // Observability and config
  { method: 'get', path: '/api/observability/metrics', expectedStatus: 401 },
  { method: 'post', path: '/api/observability/metrics', expectedStatus: 401, body: { metricName: 'cpu', value: 1 } },
  { method: 'get', path: '/api/observability/logs', expectedStatus: 401 },
  { method: 'get', path: '/api/observability/thresholds', expectedStatus: 401 },
  { method: 'post', path: '/api/observability/thresholds', expectedStatus: 401, body: {} },
  { method: 'patch', path: '/api/observability/thresholds/th-1', expectedStatus: 401, body: {} },
  { method: 'delete', path: '/api/observability/thresholds/th-1', expectedStatus: 401 },
  { method: 'get', path: '/api/observability/alerts', expectedStatus: 401 },
  { method: 'post', path: '/api/observability/alerts/alert-1/acknowledge', expectedStatus: 401 },
  { method: 'get', path: '/api/observability/notifications', expectedStatus: 401 },
  { method: 'post', path: '/api/observability/notifications/notif-1/read', expectedStatus: 401 },
  { method: 'get', path: '/api/config', expectedStatus: 401 },
  { method: 'patch', path: '/api/config', expectedStatus: 401, body: {} },

  // Backups and files
  { method: 'get', path: '/api/backups', expectedStatus: 401 },
  { method: 'post', path: '/api/backups', expectedStatus: 401, body: {} },
  { method: 'get', path: '/api/backups/restore-runs/all', expectedStatus: 401 },
  { method: 'get', path: '/api/backups/backup-1', expectedStatus: 401 },
  { method: 'post', path: '/api/backups/backup-1/restore', expectedStatus: 401, body: {} },
  { method: 'post', path: '/api/files', expectedStatus: 401 },
  { method: 'get', path: '/api/files/file-1', expectedStatus: 401 },
];

describe('No-mock full app HTTP smoke coverage', () => {
  it('POST /api/auth/login returns validation error when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'demo.admin' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  for (const tc of noAuthCases) {
    it(`${tc.method.toUpperCase()} ${tc.path} returns ${tc.expectedStatus} without auth/signature`, async () => {
      let req = request(app)[tc.method](tc.path);
      if (tc.body !== undefined) {
        req = req.send(tc.body);
      }
      const res = await req;
      expect(res.status).toBe(tc.expectedStatus);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.error?.code).toBe('string');
    });
  }

  it('GET /api/config returns semantic runtime config envelope for authenticated admin', async () => {
    const res = await request(app)
      .get('/api/config')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('config');
    expect(res.body.data).toHaveProperty('updatedAt');
    expect(res.body.data.config).toHaveProperty('heartbeatFreshnessSeconds');
    expect(res.body.data.config).toHaveProperty('logRetentionDays');
    expect(res.body.data.config).toHaveProperty('storedValueEnabled');
  });

  it('PATCH /api/config persists and reflects policy updates (no mocks)', async () => {
    const before = await request(app)
      .get('/api/config')
      .set('Authorization', authHeader());

    expect(before.status).toBe(200);
    const originalValue = Number(before.body.data.config.heartbeatFreshnessSeconds);
    const updatedValue = originalValue === 60 ? 61 : 60;

    const patch = await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ heartbeatFreshnessSeconds: updatedValue });

    expect(patch.status).toBe(200);
    expect(patch.body.success).toBe(true);
    expect(Number(patch.body.data.config.heartbeatFreshnessSeconds)).toBe(updatedValue);

    const verify = await request(app)
      .get('/api/config')
      .set('Authorization', authHeader());

    expect(verify.status).toBe(200);
    expect(Number(verify.body.data.config.heartbeatFreshnessSeconds)).toBe(updatedValue);

    await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ heartbeatFreshnessSeconds: originalValue });
  });
});
