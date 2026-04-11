import fs from 'fs/promises';
import path from 'path';
import { db } from '../../app/container.js';
import { config } from '../../app/config.js';
import { NotFoundError } from '../../common/errors/app-errors.js';
import { BACKUP_RETENTION_DAYS } from './types.js';

// ---- Backup records ----

export async function createBackupRecord(type: string, storagePath: string) {
  const expiresAt = new Date(Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return db.backupRecord.create({ data: { type, storagePath, status: 'running', expiresAt } });
}

export async function updateBackupRecord(
  id: string,
  data: { status: string; sizeBytes?: bigint; completedAt?: Date },
) {
  return db.backupRecord.update({ where: { id }, data });
}

export async function listBackupRecords(limit = 20) {
  return db.backupRecord.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

export async function findBackupById(id: string) {
  return db.backupRecord.findUnique({
    where: { id },
    include: {
      restoreRuns: {
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: { performedBy: { select: { username: true } } },
      },
    },
  });
}

export async function deleteExpiredBackups() {
  const expired = await db.backupRecord.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true },
  });

  if (expired.length === 0) {
    return { count: 0, fileCount: 0 };
  }

  let fileCount = 0;
  for (const backup of expired) {
    const backupDir = path.join(config.BACKUP_PATH, backup.id);
    await fs.rm(backupDir, { recursive: true, force: true });
    fileCount++;
  }

  const deleted = await db.backupRecord.deleteMany({
    where: { id: { in: expired.map((b) => b.id) } },
  });

  return { count: deleted.count, fileCount };
}

// ---- Restore runs ----

export async function createRestoreRun(backupId: string, performedByUserId: string) {
  // Verify backup exists
  const backup = await db.backupRecord.findUnique({ where: { id: backupId } });
  if (!backup) throw new NotFoundError(`Backup ${backupId} not found`);
  if (backup.status !== 'completed') {
    throw new Error(`Cannot restore from backup with status '${backup.status}'`);
  }
  return db.restoreRun.create({ data: { backupId, performedByUserId } });
}

export async function updateRestoreRun(
  id: string,
  data: { status: string; verificationResult?: string; completedAt?: Date },
) {
  return db.restoreRun.update({ where: { id }, data });
}

export async function listRestoreRuns(limit = 20) {
  return db.restoreRun.findMany({
    include: {
      backup: { select: { id: true, type: true, startedAt: true } },
      performedBy: { select: { username: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}
