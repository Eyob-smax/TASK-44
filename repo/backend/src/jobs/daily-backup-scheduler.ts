import { db } from '../app/container.js';
import { logger } from '../common/logging/logger.js';
import { triggerBackup } from '../modules/backups/service.js';
import { BackupType } from '../modules/backups/types.js';

export async function enqueueDailyFullBackupIfMissing(now: Date = new Date()): Promise<void> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const existing = await db.backupRecord.findFirst({
    where: {
      type: BackupType.FULL,
      startedAt: { gte: startOfDay },
      status: { in: ['running', 'completed'] },
    },
    select: { id: true, status: true },
    orderBy: { startedAt: 'desc' },
  });

  if (existing) {
    logger.info(
      { backupId: existing.id, status: existing.status, day: startOfDay.toISOString().slice(0, 10) },
      'Daily full backup already exists for current day',
    );
    return;
  }

  const { backupId } = await triggerBackup(BackupType.FULL);
  logger.info(
    { backupId, day: startOfDay.toISOString().slice(0, 10) },
    'Enqueued daily full backup',
  );
}
