import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { configRouter } from '../src/modules/configuration/routes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    heartbeatFreshnessSeconds: 120,
    storedValueEnabled: false,
    maxUploadSizeBytes: 10485760,
    acceptedImageMimeTypes: ['image/jpeg', 'image/png'],
    logRetentionDays: 30,
    parkingEscalationMinutes: 15,
    backupRetentionDays: 14,
    storagePath: '/data/object-storage',
    backupPath: '/data/backups',
  },
}));

vi.mock('../src/modules/configuration/service.js', () => ({
  getConfig: vi.fn().mockReturnValue({ config: mockConfig, updatedAt: new Date().toISOString() }),
  updateConfig: vi.fn(),
}));

let userRoles = ['Administrator'];

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
      username: 'admin',
      roles: userRoles,
      permissions: ['read:config:*', 'write:config:*'],
      orgId: 'org-1',
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

const { getConfig, updateConfig } = await import('../src/modules/configuration/service.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/config', configRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with current configuration', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/config')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.config.heartbeatFreshnessSeconds).toBe(120);
    expect(res.body.data).toHaveProperty('updatedAt');
  });
});

describe('PATCH /api/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRoles = ['Administrator'];
  });

  it('returns 200 with updated config when called by Administrator', async () => {
    const updated = { config: { ...mockConfig, heartbeatFreshnessSeconds: 60 }, updatedAt: new Date().toISOString() };
    vi.mocked(updateConfig).mockReturnValue(updated);

    const app = buildApp();
    const res = await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ heartbeatFreshnessSeconds: 60 });

    expect(res.status).toBe(200);
    expect(res.body.data.config.heartbeatFreshnessSeconds).toBe(60);
    expect(updateConfig).toHaveBeenCalledWith({ heartbeatFreshnessSeconds: 60 });
  });

  it('returns 403 when called by Auditor', async () => {
    userRoles = ['Auditor'];

    const app = buildApp();
    const res = await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ heartbeatFreshnessSeconds: 60 });

    expect(res.status).toBe(403);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('returns 400 when heartbeatFreshnessSeconds is negative', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ heartbeatFreshnessSeconds: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when storedValueEnabled is not a boolean', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ storedValueEnabled: 'yes' });

    expect(res.status).toBe(400);
  });

  it('applies partial update — only provided fields change', async () => {
    const updated = { config: { ...mockConfig, logRetentionDays: 7 }, updatedAt: new Date().toISOString() };
    vi.mocked(updateConfig).mockReturnValue(updated);

    const app = buildApp();
    const res = await request(app)
      .patch('/api/config')
      .set('Authorization', authHeader())
      .send({ logRetentionDays: 7 });

    expect(res.status).toBe(200);
    expect(updateConfig).toHaveBeenCalledWith({ logRetentionDays: 7 });
  });
});
