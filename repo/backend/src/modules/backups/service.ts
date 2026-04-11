import * as repo from './repository.js';
import { enqueueJob } from '../../jobs/job-monitor.js';
import { config } from '../../app/config.js';
import { BackupType } from './types.js';
import type { BackupRecordResponse, RestoreRunResponse } from './types.js';

function formatBackup(b: Awaited<ReturnType<typeof repo.listBackupRecords>>[number]): BackupRecordResponse {
  return {
    id: b.id,
    type: b.type as BackupType,
    status: b.status as any,
    sizeBytes: b.sizeBytes !== null ? b.sizeBytes.toString() : null,
    startedAt: b.startedAt.toISOString(),
    completedAt: b.completedAt?.toISOString() ?? null,
    expiresAt: b.expiresAt.toISOString(),
  };
}

export async function triggerBackup(type: string = BackupType.FULL): Promise<{ backupId: string }> {
  const storagePath = `${config.BACKUP_PATH}/${new Date().toISOString().slice(0, 10)}`;
  const record = await repo.createBackupRecord(type, storagePath);
  await enqueueJob('backup', { backupId: record.id, type, storagePath });
  return { backupId: record.id };
}

export async function listBackups(): Promise<BackupRecordResponse[]> {
  const records = await repo.listBackupRecords();
  return records.map(formatBackup);
}

export async function getBackupById(id: string) {
  const record = await repo.findBackupById(id);
  if (!record) return null;
  return {
    ...formatBackup(record),
    restoreRuns: record.restoreRuns.map((r) => ({
      id: r.id,
      status: r.status,
      verificationResult: r.verificationResult ? JSON.parse(r.verificationResult) : null,
      performedBy: (r as any).performedBy?.username ?? null,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  };
}

export async function triggerRestore(
  backupId: string,
  performedByUserId: string,
): Promise<{ restoreRunId: string }> {
  const restoreRun = await repo.createRestoreRun(backupId, performedByUserId);
  await enqueueJob('restore', { restoreRunId: restoreRun.id, backupId });
  return { restoreRunId: restoreRun.id };
}

export async function listRestoreRuns(): Promise<RestoreRunResponse[]> {
  const runs = await repo.listRestoreRuns();
  return runs.map((r) => ({
    id: r.id,
    backupId: r.backupId,
    status: r.status as any,
    verificationResult: r.verificationResult ? JSON.parse(r.verificationResult) : null,
    performedBy: (r as any).performedBy?.username ?? r.performedByUserId,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));
}
