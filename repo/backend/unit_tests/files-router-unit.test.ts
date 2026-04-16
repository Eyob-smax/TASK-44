import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { errorHandler } from '../src/common/middleware/error-handler.js';

vi.mock('../src/app/container.js', () => ({
  db: {
    fileAsset: {
      findUnique: vi.fn(),
    },
  },
}));

const { db } = await import('../src/app/container.js');
const { filesRouter } = await import('../src/modules/files/routes.js');

const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-files-router-unit';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'files-unit-user',
      username: 'files-unit',
      roles: ['OpsManager'],
      permissions: ['read:after-sales:*', 'write:after-sales:*'],
      orgId: 'org-files-unit',
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

function buildApp() {
  const app = express();
  app.use('/api/files', filesRouter);
  app.use(errorHandler);
  return app;
}

describe('files router unit coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/files/:id returns 404 for cross-org access', async () => {
    vi.mocked(db.fileAsset.findUnique).mockResolvedValue({
      id: 'file-1',
      storagePath: '/tmp/no-file.jpg',
      mimeType: 'image/jpeg',
      originalName: 'x.jpg',
      uploadedBy: { orgId: 'org-other' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/files/file-1')
      .set('Authorization', authHeader({ orgId: 'org-files-unit' }));

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('GET /api/files/:id streams file when authorized and path exists', async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), 'files-unit-'));
    const tempFile = path.join(tempDir, 'asset.jpg');
    await fs.writeFile(tempFile, Buffer.from('dummy-content'));

    vi.mocked(db.fileAsset.findUnique).mockResolvedValue({
      id: 'file-2',
      storagePath: tempFile,
      mimeType: 'image/jpeg',
      originalName: 'asset.jpg',
      uploadedBy: { orgId: 'org-files-unit' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/files/file-2')
      .set('Authorization', authHeader({ orgId: 'org-files-unit' }));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
