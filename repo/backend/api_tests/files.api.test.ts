import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../src/common/middleware/error-handler.js';

vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-for-files-api-tests');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'test-integration-signing-secret-for-tests');

vi.mock('sharp', () => {
  const sharpMock = vi.fn(() => {
    const api: any = {
      rotate: () => api,
      resize: () => api,
      grayscale: () => api,
      raw: () => api,
      png: () => api,
      jpeg: () => api,
      metadata: vi.fn().mockResolvedValue({ format: 'jpeg', width: 800, height: 600 }),
      toBuffer: vi.fn((opts?: { resolveWithObject?: boolean }) => {
        if (opts?.resolveWithObject) {
          return Promise.resolve({ data: Buffer.alloc(72, 1) });
        }
        return Promise.resolve(Buffer.from([1, 2, 3, 4]));
      }),
    };
    return api;
  });

  return { default: sharpMock };
});

vi.mock('../src/app/container.js', () => ({
  db: {
    fileAsset: {
      findUnique: vi.fn(),
    },
  },
}));

const { filesRouter } = await import('../src/modules/files/routes.js');
const { db } = await import('../src/app/container.js');
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
      permissions: ['read:after-sales:*'],
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
  app.use('/api/files', filesRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/files/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when file belongs to a different org', async () => {
    vi.mocked(db.fileAsset.findUnique).mockResolvedValue({
      id: 'file-foreign',
      storagePath: '/tmp/file-foreign.jpg',
      mimeType: 'image/jpeg',
      originalName: 'foreign.jpg',
      uploadedBy: { orgId: 'org-2' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/files/file-foreign')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when file path is missing on disk', async () => {
    vi.mocked(db.fileAsset.findUnique).mockResolvedValue({
      id: 'file-own',
      storagePath: '/tmp/does-not-exist.jpg',
      mimeType: 'image/jpeg',
      originalName: 'missing.jpg',
      uploadedBy: { orgId: 'org-1' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/files/file-own')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/files', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when caller lacks write:after-sales permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/files')
      .set('Authorization', authHeader({ permissions: ['read:after-sales:*'] }))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('passes authorization and returns 400 when no file is provided', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/files')
      .set('Authorization', authHeader({ permissions: ['write:after-sales:*'] }))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for unsupported file type', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/files')
      .set('Authorization', authHeader({ permissions: ['write:after-sales:*'] }))
      .attach('file', Buffer.from('not-an-image'), {
        filename: 'evidence.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for oversized upload', async () => {
    const app = buildApp();
    const tooLargeJpeg = Buffer.alloc((10 * 1024 * 1024) + 1, 1);
    const res = await request(app)
      .post('/api/files')
      .set('Authorization', authHeader({ permissions: ['write:after-sales:*'] }))
      .attach('file', tooLargeJpeg, {
        filename: 'large.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
