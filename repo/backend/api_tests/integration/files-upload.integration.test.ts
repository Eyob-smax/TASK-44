import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import { db } from '../../src/app/container.js';
import { filesRouter } from '../../src/modules/files/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `files-upload-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-files-upload-int';

let orgId = '';
let userId = '';
let fileId = '';
let storedPath = '';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId,
      username: `files-user-${RUN_ID}`,
      roles: ['Administrator', 'CustomerServiceAgent'],
      permissions: ['read:after-sales:*', 'write:after-sales:*'],
      orgId,
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

function tinyPngBuffer(): Buffer {
  // 1x1 PNG
  return Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63606060000000040001f61738550000000049454e44ae426082',
    'hex',
  );
}

describe('No-mock HTTP integration: files upload', () => {
  beforeAll(async () => {
    const org = await db.organization.create({
      data: {
        name: `Files Org ${RUN_ID}`,
        type: 'district',
        timezone: 'UTC',
      },
    });
    orgId = org.id;

    const user = await db.user.create({
      data: {
        username: `files-upload-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Files Upload Integration User',
        isActive: true,
        orgId,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (fileId) {
      const hashRows = await db.perceptualHash.findMany({ where: { fileAssetId: fileId } });
      if (hashRows.length > 0) {
        await db.perceptualHash.deleteMany({ where: { fileAssetId: fileId } });
      }

      const fileAsset = await db.fileAsset.findUnique({ where: { id: fileId } });
      if (fileAsset?.storagePath) {
        storedPath = fileAsset.storagePath;
      }
      await db.fileAsset.deleteMany({ where: { id: fileId } });
    }

    if (storedPath) {
      await fs.rm(storedPath, { force: true }).catch(() => {});
    }

    if (userId) await db.user.deleteMany({ where: { id: userId } });
    if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
  });

  it('POST /api/files uploads JPEG/PNG through real handler and can be fetched', async () => {
    const app = buildApp();

    const uploadRes = await request(app)
      .post('/api/files')
      .set('Authorization', authHeader())
      .attach('file', tinyPngBuffer(), { filename: `tiny-${RUN_ID}.png`, contentType: 'image/png' });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    fileId = uploadRes.body.data.id as string;

    const getRes = await request(app)
      .get(`/api/files/${fileId}`)
      .set('Authorization', authHeader());

    expect(getRes.status).toBe(200);
    expect(getRes.headers['content-type']).toBeDefined();
  });
});
