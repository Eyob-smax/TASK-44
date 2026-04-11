import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/common/middleware/error-handler.js';

/**
 * Idempotency API Contract Tests
 *
 * Verifies the X-Idempotency-Key header behavior at the HTTP layer.
 * The idempotency middleware is applied on the login route for contract tests.
 * Replay behavior is verified using a mocked DB store.
 */

// Set env vars before any module that reads process.env is loaded
vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-for-idempotency-tests-at-32chars');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'test-integration-signing-secret-for-tests');

vi.mock('../src/app/container.js', () => ({
  db: {
    idempotencyRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock auth service so POST /api/auth/login works without DB
vi.mock('../src/modules/auth/service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/auth/service.js')>();
  return {
    ...actual,
    login: vi.fn().mockResolvedValue({
      user: { id: 'u1', username: 'bob', displayName: 'Bob', isActive: true, lastLoginAt: null, roles: [], createdAt: '' },
      permissions: [],
      token: 'mock.token.value',
    }),
  };
});

const { createApp } = await import('../src/app/server.js');
const app = createApp();

const { idempotency } = await import('../src/common/middleware/idempotency.js');
const { db } = await import('../src/app/container.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.idempotencyRecord.findFirst).mockResolvedValue(null as any);
});

describe('X-Idempotency-Key validation', () => {
  it('key > 64 characters returns 400 VALIDATION_ERROR', async () => {
    const longKey = 'x'.repeat(65);

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Idempotency-Key', longKey)
      .send({ username: 'bob', password: 'pass' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('key at exactly 64 characters does not trigger validation error', async () => {
    const validKey = 'a'.repeat(64);

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Idempotency-Key', validKey)
      .send({ username: 'bob', password: 'pass' });

    // Should NOT be 400 VALIDATION_ERROR for the key length
    if (res.status === 400) {
      expect(res.body.error.code).not.toBe('VALIDATION_ERROR');
    }
  });
});

describe('Idempotency replay behavior', () => {
  it('replays cached response on second request with matching key, method, and path', async () => {
    const cachedBody = { success: true, data: { token: 'cached-token-value' } };
    vi.mocked(db.idempotencyRecord.findFirst).mockResolvedValueOnce({
      key: 'replay-key-001',
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 200,
      responseBody: JSON.stringify(cachedBody),
      expiresAt: new Date(Date.now() + 86_400_000),
    } as any);

    const miniApp = express();
    miniApp.use(express.json());
    miniApp.post('/api/auth/login', idempotency, (_req, res) => {
      res.json({ success: true, data: { token: 'fresh-token-value' } });
    });
    miniApp.use(errorHandler);

    const res = await request(miniApp)
      .post('/api/auth/login')
      .set('X-Idempotency-Key', 'replay-key-001')
      .send({ username: 'bob', password: 'pass' });

    expect(res.status).toBe(200);
    // Must return the cached response, not the fresh handler response
    expect(res.body.data.token).toBe('cached-token-value');
    expect(vi.mocked(db.idempotencyRecord.create)).not.toHaveBeenCalled();
  });

  it('returns 409 CONFLICT when key is replayed against a different path', async () => {
    vi.mocked(db.idempotencyRecord.findFirst).mockResolvedValueOnce({
      key: 'cross-path-key-002',
      method: 'POST',
      path: '/api/other-endpoint',
      statusCode: 201,
      responseBody: '{"success":true}',
      expiresAt: new Date(Date.now() + 86_400_000),
    } as any);

    const miniApp = express();
    miniApp.use(express.json());
    miniApp.post('/api/auth/login', idempotency, (_req, res) => {
      res.json({ success: true });
    });
    miniApp.use(errorHandler);

    const res = await request(miniApp)
      .post('/api/auth/login')
      .set('X-Idempotency-Key', 'cross-path-key-002')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('Principal-scoped idempotency keys', () => {
  it('uses different record lookups for the same key from different users', async () => {
    vi.mocked(db.idempotencyRecord.findFirst).mockResolvedValue(null);

    const miniApp = express();
    miniApp.use(express.json());
    miniApp.use((req, _res, next) => {
      const uid = req.header('x-user-id') ?? 'u1';
      const oid = req.header('x-org-id') ?? 'org-1';
      req.user = {
        userId: uid,
        username: uid,
        roles: ['OpsManager'],
        permissions: ['write:memberships:*'],
        orgId: oid,
      };
      next();
    });
    miniApp.post('/api/scoped', idempotency, (_req, res) => {
      res.json({ success: true, data: { ok: true } });
    });
    miniApp.use(errorHandler);

    await request(miniApp)
      .post('/api/scoped')
      .set('X-Idempotency-Key', 'shared-key')
      .set('x-user-id', 'user-1')
      .set('x-org-id', 'org-1')
      .send({ value: 1 });

    await request(miniApp)
      .post('/api/scoped')
      .set('X-Idempotency-Key', 'shared-key')
      .set('x-user-id', 'user-2')
      .set('x-org-id', 'org-1')
      .send({ value: 1 });

    const calls = vi.mocked(db.idempotencyRecord.findFirst).mock.calls;
    const relevantCalls = calls.slice(-2);
    expect(relevantCalls.length).toBe(2);

    const scopeOne = (relevantCalls[0]?.[0] as any)?.where?.scope;
    const scopeTwo = (relevantCalls[1]?.[0] as any)?.where?.scope;
    const keyOne = (relevantCalls[0]?.[0] as any)?.where?.key;
    const keyTwo = (relevantCalls[1]?.[0] as any)?.where?.key;
    expect(scopeOne).toBeTruthy();
    expect(scopeTwo).toBeTruthy();
    expect(scopeOne).not.toBe(scopeTwo); // scope differs per user
    expect(keyOne).toBe('shared-key');   // raw key is unchanged
    expect(keyTwo).toBe('shared-key');
  });
});
