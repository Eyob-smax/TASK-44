import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { backupsRouter } from '../src/modules/backups/routes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { NotFoundError } from '../src/common/errors/app-errors.js';

const { mockBackups } = vi.hoisted(() => ({
  mockBackups: [
    {
      id: 'backup-1',
      type: 'full',
      status: 'completed',
      sizeBytes: '4096',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
    },
  ],
}));

vi.mock('../src/modules/backups/service.js', () => ({
  triggerBackup: vi.fn().mockResolvedValue({ backupId: 'backup-new' }),
  listBackups: vi.fn().mockResolvedValue(mockBackups),
  getBackupById: vi.fn(),
  triggerRestore: vi.fn().mockResolvedValue({ restoreRunId: 'restore-new' }),
  listRestoreRuns: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/common/middleware/idempotency.js', () => ({
  idempotency: (_req: any, _res: any, next: any) => next(),
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
      permissions: [],
      orgId: 'org-1',
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

const { triggerBackup, listBackups, getBackupById, triggerRestore } =
  await import('../src/modules/backups/service.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/backups', backupsRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRoles = ['OpsManager'];
  });

  it('returns 200 with backup list', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/backups')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.backups).toHaveLength(1);
    expect(res.body.data.backups[0].id).toBe('backup-1');
  });

  it('returns 403 when role is insufficient (e.g. plain user)', async () => {
    userRoles = ['ClassroomSupervisor'];

    const app = buildApp();
    const res = await request(app)
      .get('/api/backups')
      .set('Authorization', authHeader());

    expect(res.status).toBe(403);
  });
});

describe('POST /api/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRoles = ['Administrator'];
  });

  it('returns 202 with backupId after queuing backup job', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/backups')
      .set('Authorization', authHeader())
      .send({ type: 'full' });

    expect(res.status).toBe(202);
    expect(res.body.data.backupId).toBe('backup-new');
    expect(triggerBackup).toHaveBeenCalledWith('full');
  });

  it('defaults to full backup when type is omitted', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/backups')
      .set('Authorization', authHeader())
      .send({});

    expect(triggerBackup).toHaveBeenCalledWith('full');
  });

  it('returns 403 when called by OpsManager (admin only)', async () => {
    userRoles = ['OpsManager'];

    const app = buildApp();
    const res = await request(app)
      .post('/api/backups')
      .set('Authorization', authHeader())
      .send({ type: 'full' });

    expect(res.status).toBe(403);
    expect(triggerBackup).not.toHaveBeenCalled();
  });
});

describe('GET /api/backups/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRoles = ['Auditor'];
  });

  it('returns 200 with backup details including restore runs', async () => {
    vi.mocked(getBackupById).mockResolvedValue({
      ...mockBackups[0],
      restoreRuns: [
        {
          id: 'run-1',
          status: 'completed',
          verificationResult: { status: 'verified' },
          performedBy: 'admin',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/backups/backup-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.restoreRuns).toHaveLength(1);
  });

  it('returns 404 when backup does not exist', async () => {
    vi.mocked(getBackupById).mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app)
      .get('/api/backups/does-not-exist')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/backups/:id/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRoles = ['Administrator'];
  });

  it('returns 202 with restoreRunId after queuing restore job', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/backups/backup-1/restore')
      .set('Authorization', authHeader());

    expect(res.status).toBe(202);
    expect(res.body.data.restoreRunId).toBe('restore-new');
    expect(triggerRestore).toHaveBeenCalledWith('backup-1', 'user-1');
  });

  it('returns 403 when called by OpsManager', async () => {
    userRoles = ['OpsManager'];

    const app = buildApp();
    const res = await request(app)
      .post('/api/backups/backup-1/restore')
      .set('Authorization', authHeader());

    expect(res.status).toBe(403);
    expect(triggerRestore).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError as 404 when backup is missing', async () => {
    vi.mocked(triggerRestore).mockRejectedValue(new NotFoundError('Backup not-found not found'));

    const app = buildApp();
    const res = await request(app)
      .post('/api/backups/not-found/restore')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
  });
});

describe('GET /api/backups/restore-runs/all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRoles = ['OpsManager'];
  });

  it('returns 200 with restore run list', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/backups/restore-runs/all')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('restoreRuns');
  });
});
