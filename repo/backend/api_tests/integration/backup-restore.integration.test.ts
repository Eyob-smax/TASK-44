import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../../src/app/container.js';
import { BackupWorker } from '../../src/jobs/workers/backup-worker.js';
import { RestoreWorker } from '../../src/jobs/workers/restore-worker.js';

const RUN_ID = `backup-restore-${Date.now()}`;
const BACKUP_ROOT = process.env['BACKUP_PATH'] ?? '/tmp/campusops-test-backups';
const METRIC_NAME = `restore_probe_${RUN_ID}`;

let backupId = '';
let restoreRunId = '';
let performedByUserId = '';

describe('Backup/Restore worker — end-to-end DB verification', () => {
  beforeAll(async () => {
    await fs.mkdir(BACKUP_ROOT, { recursive: true });

    const user = await db.user.create({
      data: {
        username: `restore-user-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Restore Worker Integration User',
        isActive: true,
      },
    });
    performedByUserId = user.id;

    await db.runtimeMetric.create({
      data: {
        metricName: METRIC_NAME,
        value: 42,
        unit: 'count',
      },
    });

    const backupRecord = await db.backupRecord.create({
      data: {
        type: 'full',
        storagePath: BACKUP_ROOT,
        status: 'pending',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    backupId = backupRecord.id;

    const restoreRun = await db.restoreRun.create({
      data: {
        backupId,
        performedByUserId,
        status: 'pending',
      },
    });
    restoreRunId = restoreRun.id;
  }, 120_000);

  afterAll(async () => {
    await db.runtimeMetric.deleteMany({ where: { metricName: METRIC_NAME } });
    if (restoreRunId) {
      await db.restoreRun.deleteMany({ where: { id: restoreRunId } });
    }
    if (backupId) {
      await db.backupRecord.deleteMany({ where: { id: backupId } });
      await fs.rm(path.join(BACKUP_ROOT, backupId), { recursive: true, force: true });
    }
    if (performedByUserId) {
      await db.user.deleteMany({ where: { id: performedByUserId } });
    }
  }, 120_000);

  it('restores a deleted runtime metric from backup snapshot', async () => {
    const backupWorker = new BackupWorker();
    await backupWorker.handle({ backupId, type: 'full', storagePath: BACKUP_ROOT });

    const dumpPath = path.join(BACKUP_ROOT, backupId, 'dump.sql');
    const dumpExists = await fs.access(dumpPath).then(() => true).catch(() => false);
    expect(dumpExists).toBe(true);

    const manifestPath = path.join(BACKUP_ROOT, backupId, 'object-storage-manifest.json');
    const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false);
    expect(manifestExists).toBe(true);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    expect(manifest).toHaveProperty('generatedAt');
    expect(manifest).toHaveProperty('files');
    expect(Array.isArray(manifest.files)).toBe(true);

    await db.runtimeMetric.deleteMany({ where: { metricName: METRIC_NAME } });
    const deletedCount = await db.runtimeMetric.count({ where: { metricName: METRIC_NAME } });
    expect(deletedCount).toBe(0);

    const restoreWorker = new RestoreWorker();
    await restoreWorker.handle({ restoreRunId, backupId });

    const restoredCount = await db.runtimeMetric.count({ where: { metricName: METRIC_NAME } });
    expect(restoredCount).toBe(1);

    const restoreRun = await db.restoreRun.findUnique({ where: { id: restoreRunId } });
    expect(restoreRun?.status).toBe('completed');

    const verification = JSON.parse(restoreRun!.verificationResult as string);
    expect(verification.objectStorageManifestPresent).toBeDefined();
  }, 120_000);
});
