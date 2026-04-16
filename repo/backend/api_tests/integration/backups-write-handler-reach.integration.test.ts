import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { backupsRouter } from '../../src/modules/backups/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `backups-write-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-backups-write-int';

let userId = '';
let backupId = '';

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
      username: `backups-user-${RUN_ID}`,
      roles: ['Administrator'],
      permissions: ['read:backups:*', 'write:backups:*'],
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/backups', backupsRouter);
  app.use(errorHandler);
  return app;
}

describe('No-mock HTTP integration: backups write handler reach', () => {
  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        username: `backups-write-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Backups Write Integration User',
        isActive: true,
      },
    });
    userId = user.id;

    const backup = await db.backupRecord.create({
      data: {
        type: 'full',
        storagePath: `/tmp/backups-write-${RUN_ID}`,
        status: 'completed',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    backupId = backup.id;
  });

  afterAll(async () => {
    await db.backgroundJob.deleteMany({ where: { type: { in: ['backup', 'restore'] } } });
    await db.restoreRun.deleteMany({ where: { backupId } });
    if (backupId) await db.backupRecord.deleteMany({ where: { id: backupId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
  });

  it('POST /api/backups and POST /api/backups/:id/restore reach handlers', async () => {
    const app = buildApp();

    const triggerBackupRes = await request(app)
      .post('/api/backups')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `backup-trigger-${RUN_ID}`)
      .send({ type: 'full' });

    expect(triggerBackupRes.status).toBe(202);
    expect(triggerBackupRes.body.success).toBe(true);

    const triggerRestoreRes = await request(app)
      .post(`/api/backups/${backupId}/restore`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `backup-restore-${RUN_ID}`)
      .send({});

    expect(triggerRestoreRes.status).toBe(202);
    expect(triggerRestoreRes.body.success).toBe(true);
  });
});
