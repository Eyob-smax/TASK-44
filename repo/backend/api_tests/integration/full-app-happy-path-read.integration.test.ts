import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app/server.js';

type ReadCase = {
  path: string;
  note: string;
};

const app = createApp();
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-full-app-happy-path-read';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}): string {
  const token = jwt.sign(
    {
      userId: 'happy-path-read-user',
      username: 'happy-path-read-admin',
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
      orgId: 'org-happy-path-1',
      ...overrides,
    },
    jwtSecret,
  );

  return `Bearer ${token}`;
}

const readCases: ReadCase[] = [
  { path: '/api/orgs', note: 'master data org list' },
  { path: '/api/orgs/org-happy-path-1/students', note: 'students list' },
  { path: '/api/orgs/org-happy-path-1/departments', note: 'departments list' },
  { path: '/api/orgs/org-happy-path-1/semesters', note: 'semesters list' },
  { path: '/api/classroom-ops/anomalies', note: 'classroom anomalies list' },
  { path: '/api/parking/facilities', note: 'parking facilities list' },
  { path: '/api/parking/exceptions', note: 'parking exceptions list' },
  { path: '/api/orgs/org-happy-path-1/warehouses', note: 'logistics warehouses list' },
  { path: '/api/orgs/org-happy-path-1/carriers', note: 'logistics carriers list' },
  { path: '/api/orgs/org-happy-path-1/shipping-fee-templates', note: 'shipping fee templates list' },
  { path: '/api/orgs/org-happy-path-1/shipments', note: 'org shipments list' },
  { path: '/api/orgs/org-happy-path-1/tickets', note: 'after-sales tickets list' },
  { path: '/api/orgs/org-happy-path-1/membership-tiers', note: 'membership tiers list' },
  { path: '/api/orgs/org-happy-path-1/members', note: 'members list' },
  { path: '/api/observability/metrics', note: 'observability metrics summary' },
  { path: '/api/observability/logs', note: 'observability logs list' },
  { path: '/api/observability/thresholds', note: 'observability thresholds list' },
  { path: '/api/observability/alerts', note: 'observability alerts list' },
  { path: '/api/observability/notifications', note: 'observability notifications list' },
  { path: '/api/config', note: 'configuration read' },
  { path: '/api/backups', note: 'backups list' },
  { path: '/api/backups/restore-runs/all', note: 'restore runs list' },
];

describe('No-mock full app happy-path read coverage', () => {
  for (const tc of readCases) {
    it(`GET ${tc.path} returns 200 (${tc.note})`, async () => {
      const res = await request(app)
        .get(tc.path)
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
    });
  }
});
