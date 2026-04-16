import { beforeEach, describe, expect, it, vi } from 'vitest';

const rmMock = vi.fn();

vi.mock('../src/app/container.js', () => ({
  db: {
    backupRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../src/app/config.js', () => ({
  config: {
    BACKUP_PATH: '/tmp/backups',
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    rm: rmMock,
  },
  rm: rmMock,
}));

const repo = await import('../src/modules/backups/repository.js');
const { db } = await import('../src/app/container.js');

describe('backups repository unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createBackupRecord persists running backup with retention expiry', async () => {
    vi.mocked(db.backupRecord.create).mockResolvedValue({ id: 'b-1' } as any);

    await repo.createBackupRecord('full', '/tmp/backups/b-1');

    expect(db.backupRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'full', status: 'running', storagePath: '/tmp/backups/b-1' }),
    });
  });

  it('deleteExpiredBackups removes files and DB records', async () => {
    vi.mocked(db.backupRecord.findMany).mockResolvedValue([{ id: 'b-1' }, { id: 'b-2' }] as any);
    vi.mocked(db.backupRecord.deleteMany).mockResolvedValue({ count: 2 } as any);

    const result = await repo.deleteExpiredBackups();

    expect(rmMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ count: 2, fileCount: 2 });
  });
});
