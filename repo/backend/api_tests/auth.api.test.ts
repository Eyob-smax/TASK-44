import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

/**
 * Auth API Contract Tests
 *
 * These tests mount the auth router against a mocked auth service to verify
 * HTTP-level contracts (status codes, envelope shapes, error codes) without
 * requiring a live database connection.
 */

// Set env vars before importing app/config-bound modules.
vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-api-tests');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'test-integration-signing-secret-for-auth-api-tests');

// Mock the auth service login to avoid real DB calls
vi.mock('../src/modules/auth/service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/auth/service.js')>();
  return {
    ...actual,
    login: vi.fn().mockImplementation(async (username: string, password: string) => {
      if (username === 'alice' && password === 'correct-password') {
        return {
          user: {
            id: 'user-001',
            username: 'alice',
            displayName: 'Alice',
            isActive: true,
            lastLoginAt: null,
            roles: [{ id: 'role-001', name: 'Auditor' }],
            createdAt: new Date().toISOString(),
          },
          permissions: ['read:audit-logs:*'],
          token: 'eyJhbGciOiJIUzI1NiJ9.test.sig',
        };
      }
      const { UnauthorizedError } = await import('../src/common/errors/app-errors.js');
      throw new UnauthorizedError('Invalid credentials');
    }),
  };
});

vi.mock('../src/modules/auth/repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/auth/repository.js')>();
  return {
    ...actual,
    findRolesByIds: vi.fn().mockResolvedValue([{ id: 'role-administrator', name: 'Administrator' }]),
    createUser: vi.fn().mockResolvedValue({
      id: 'user-ops-001',
      username: 'opsmgr-school-a',
      displayName: 'Ops Manager School A',
      orgId: 'org-school-a',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      userRoles: [
        {
          role: {
            id: 'role-opsmanager',
            name: 'OpsManager',
            rolePermissions: [],
          },
        },
      ],
    }),
    findUserById: vi.fn().mockResolvedValue({
      id: 'user-001',
      username: 'alice',
      displayName: 'Alice',
      orgId: 'org-1',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      userRoles: [
        {
          role: {
            id: 'role-001',
            name: 'Auditor',
            rolePermissions: [
              { permission: { action: 'read', resource: 'audit-logs', scope: '*' } },
            ],
          },
        },
      ],
    }),
  };
});

const { createApp } = await import('../src/app/server.js');
const app = createApp();
const { createUser, findRolesByIds } = await import('../src/modules/auth/repository.js');
const { config } = await import('../src/app/config.js');

function makeToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '1h' });
}

describe('POST /api/auth/login', () => {
  it('returns 200 with token and user for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.username).toBe('alice');
  });

  it('returns 400 VALIDATION_ERROR envelope when password field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
    expect(res.body.error.details['password']).toBeDefined();
  });

  it('returns 400 VALIDATION_ERROR envelope when username field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'secret' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details['username']).toBeDefined();
  });

  it('returns 401 UNAUTHORIZED for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 with user object for a valid token', async () => {
    // Get a real token via login first
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'correct-password' });

    const token = loginRes.body.data.token as string;

    // The token from the mock is not actually signed with JWT_SECRET,
    // so we sign a real one here for the /me route test
    const jwt = await import('jsonwebtoken');
    const realToken = jwt.default.sign(
      {
        userId: 'user-001',
        username: 'alice',
        roles: ['Auditor'],
        permissions: ['read:audit-logs:*'],
        orgId: 'org-1',
      },
      config.JWT_SECRET,
      { expiresIn: '1h' },
    );

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${realToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.username).toBe('alice');
    expect(meRes.body.data.permissions).toContain('read:audit-logs:*');
  });
});

describe('POST /api/admin/users', () => {
  it('creates a non-admin user with seeded role ID and orgId', async () => {
    vi.mocked(findRolesByIds).mockResolvedValueOnce([
      { id: 'role-opsmanager', name: 'OpsManager' },
    ] as any);
    vi.mocked(createUser).mockResolvedValueOnce({
      id: 'user-ops-001',
      username: 'opsmgr-school-a',
      displayName: 'Ops Manager School A',
      orgId: 'org-school-a',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      userRoles: [
        {
          role: {
            id: 'role-opsmanager',
            name: 'OpsManager',
            rolePermissions: [],
          },
        },
      ],
    } as any);

    const adminToken = makeToken({
      userId: 'admin-1',
      username: 'admin',
      roles: ['Administrator'],
      permissions: ['create:users:*'],
    });

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'opsmgr-school-a',
        password: 'SecurePassword123!',
        displayName: 'Ops Manager School A',
        roleIds: ['role-opsmanager'],
        orgId: 'org-school-a',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orgId).toBe('org-school-a');
    expect(res.body.data.roles[0]).toEqual({ id: 'role-opsmanager', name: 'OpsManager' });
  });

  it('returns 400 when assigning non-admin role without orgId', async () => {
    vi.mocked(findRolesByIds).mockResolvedValueOnce([
      { id: 'role-opsmanager', name: 'OpsManager' },
    ] as any);

    const adminToken = makeToken({
      userId: 'admin-1',
      username: 'admin',
      roles: ['Administrator'],
      permissions: ['create:users:*'],
    });

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'opsmgr-school-a',
        password: 'SecurePassword123!',
        displayName: 'Ops Manager School A',
        roleIds: ['role-opsmanager'],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.orgId).toBeDefined();
  });
});
