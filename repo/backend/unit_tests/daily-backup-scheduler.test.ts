import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/app/container.js', () => ({
  db: {
    backupRecord: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../src/modules/backups/service.js', () => ({
  triggerBackup: vi.fn(),
}));

vi.mock('../src/common/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
  },
}));

const { enqueueDailyFullBackupIfMissing } = await import('../src/jobs/daily-backup-scheduler.js');
const { db } = await import('../src/app/container.js');
const { triggerBackup } = await import('../src/modules/backups/service.js');

describe('enqueueDailyFullBackupIfMissing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips enqueue when a completed backup already exists today', async () => {
    vi.mocked(db.backupRecord.findFirst).mockResolvedValue({
      id: 'backup-1',
      status: 'completed',
    } as any);

    await enqueueDailyFullBackupIfMissing(new Date('2026-04-11T12:00:00.000Z'));

    expect(triggerBackup).not.toHaveBeenCalled();
  });

  it('skips enqueue when a running backup already exists today', async () => {
    vi.mocked(db.backupRecord.findFirst).mockResolvedValue({
      id: 'backup-2',
      status: 'running',
    } as any);

    await enqueueDailyFullBackupIfMissing(new Date('2026-04-11T18:00:00.000Z'));

    expect(triggerBackup).not.toHaveBeenCalled();
  });

  it('enqueues a full backup when no eligible backup exists today', async () => {
    vi.mocked(db.backupRecord.findFirst).mockResolvedValue(null);
    vi.mocked(triggerBackup).mockResolvedValue({ backupId: 'backup-new' } as any);

    await enqueueDailyFullBackupIfMissing(new Date('2026-04-11T08:00:00.000Z'));

    expect(triggerBackup).toHaveBeenCalledWith('full');
  });

  it('enqueues a new backup when only failed backups exist today', async () => {
    vi.mocked(db.backupRecord.findFirst).mockResolvedValue(null);
    vi.mocked(triggerBackup).mockResolvedValue({ backupId: 'backup-retry' } as any);

    await enqueueDailyFullBackupIfMissing(new Date('2026-04-11T21:00:00.000Z'));

    expect(triggerBackup).toHaveBeenCalledWith('full');
  });
});
