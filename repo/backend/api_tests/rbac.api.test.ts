import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../src/modules/auth/repository.js', () => ({
  findRolesByIds: vi.fn().mockResolvedValue([{ id: 'role-001', name: 'Administrator' }]),
  createUser: vi.fn().mockResolvedValue({
    id: 'user-new',
    username: 'newuser',
    displayName: 'New User',
    orgId: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userRoles: [{ role: { id: 'role-001', name: 'Administrator', rolePermissions: [] } }],
  }),
}));

beforeAll(() => {
  vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
  vi.stubEnv('JWT_SECRET', 'test-jwt-secret-rbac-tests');
  vi.stubEnv('AES_KEY', 'a'.repeat(64));
});

const { createApp } = await import('../src/app/server.js');
const app = createApp();

const { config } = await import('../src/app/config.js');

const JWT_SECRET = config.JWT_SECRET;

function makeToken(roles: string[], permissions: string[] = []): string {
  return jwt.sign(
    { userId: 'user-test', username: 'testuser', roles, permissions, orgId: 'org-1' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('RBAC — POST /api/admin/users', () => {
  it('returns 403 FORBIDDEN when token has only Auditor role', async () => {
    const token = makeToken(['Auditor'], ['read:audit-logs:*']);

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'newuser',
        password: 'Password123!',
        displayName: 'New User',
        roleIds: ['role-001'],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns non-403 when token has Administrator role (proceeds past auth check)', async () => {
    const token = makeToken(['Administrator'], ['create:users:*']);

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'newuser',
        password: 'Password123!',
        displayName: 'New User',
        roleIds: ['role-001'],
      });

    // Should not be 403 — may be 400 (validation), 500 (no DB), or 201
    expect(res.status).not.toBe(403);
  });

  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .send({ username: 'x', password: 'y', displayName: 'Z', roleIds: [] });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
