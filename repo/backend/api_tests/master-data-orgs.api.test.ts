import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../src/common/middleware/error-handler.js';

vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-master-data-orgs');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'test-integration-signing-secret-for-master-data-orgs');

vi.mock('../src/modules/master-data/repository.js', () => ({
  listOrgs: vi.fn(),
}));

const { masterDataRouter } = await import('../src/modules/master-data/routes.js');
const { listOrgs } = await import('../src/modules/master-data/repository.js');
const { config } = await import('../src/app/config.js');

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
      userId: 'user-1',
      username: 'test',
      roles: ['OpsManager'],
      permissions: ['read:master-data:*'],
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
  app.use('/api/orgs', masterDataRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/orgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/orgs');

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('returns all organizations for Administrator', async () => {
    vi.mocked(listOrgs).mockResolvedValueOnce([
      { id: 'org-1', name: 'District A' },
      { id: 'org-2', name: 'District B' },
    ] as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs')
      .set('Authorization', authHeader({ roles: ['Administrator'], permissions: ['read:master-data:*'], orgId: undefined as any }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(listOrgs).toHaveBeenCalledWith(undefined);
  });

  it('returns only caller organization for non-admin users', async () => {
    vi.mocked(listOrgs).mockResolvedValueOnce([
      { id: 'org-1', name: 'District A' },
    ] as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs')
      .set('Authorization', authHeader({ roles: ['OpsManager'], orgId: 'org-1' }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('org-1');
    expect(listOrgs).toHaveBeenCalledWith('org-1');
  });

  it('returns 401 UNAUTHORIZED when non-admin token has no orgId', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs')
      .set('Authorization', authHeader({ roles: ['OpsManager'], orgId: undefined as any }));

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });
});
