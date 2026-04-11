import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'mysql://user:pass@localhost:3306/campusops_test');

const mockDb = {
  restoreRun: {
    update: vi.fn(),
  },
  $queryRaw: vi.fn(),
  user: {
    count: vi.fn(),
  },
};

const mockAccess = vi.fn();
const mockReadFile = vi.fn();
const mockStat = vi.fn();
const mockExecSync = vi.fn();

vi.mock('../src/app/container.js', () => ({ db: mockDb }));
vi.mock('../src/app/config.js', () => ({
  config: {
    BACKUP_PATH: '/tmp/campusops-backups',
  },
}));
vi.mock('../src/common/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('fs/promises', () => ({
  default: {
    access: mockAccess,
    readFile: mockReadFile,
    stat: mockStat,
  },
  access: mockAccess,
  readFile: mockReadFile,
  stat: mockStat,
}));
vi.mock('child_process', () => ({ execSync: mockExecSync }));

const { RestoreWorker } = await import('../src/jobs/workers/restore-worker.js');

describe('RestoreWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks restore as failed when dump file is missing', async () => {
    mockAccess.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('dump.sql')) {
        throw new Error('ENOENT');
      }
      throw new Error('ENOENT');
    });

    const worker = new RestoreWorker();
    await worker.handle({ restoreRunId: 'restore-1', backupId: 'backup-1' });

    expect(mockDb.restoreRun.update).toHaveBeenCalledTimes(2);
    expect(mockDb.restoreRun.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { status: 'running' } }),
    );

    const secondCall = vi.mocked(mockDb.restoreRun.update).mock.calls[1]?.[0] as any;
    expect(secondCall.data.status).toBe('failed');
    const verification = JSON.parse(secondCall.data.verificationResult);
    expect(verification.status).toBe('dump_missing');
    expect(verification.parseable).toBe(false);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('marks restore as completed when dump exists and mysql restore succeeds', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(
      JSON.stringify({ type: 'full', startedAt: '2026-01-01T00:00:00.000Z' }),
    );
    mockExecSync.mockImplementation(() => undefined);
    mockStat.mockResolvedValue({ size: 4096 });
    vi.mocked(mockDb.$queryRaw).mockResolvedValue([{ cnt: 1n }] as any);
    vi.mocked(mockDb.user.count).mockResolvedValue(42 as any);

    const worker = new RestoreWorker();
    await worker.handle({ restoreRunId: 'restore-2', backupId: 'backup-2' });

    expect(mockExecSync).toHaveBeenCalledTimes(1);
  const [command, options] = vi.mocked(mockExecSync).mock.calls[0] as [string, any];
  expect(command).toContain('mysql -h localhost -P 3306 -u user campusops_test <');
  expect(command).not.toContain('-ppass');
  expect(options.env.MYSQL_PWD).toBe('pass');
    const secondCall = vi.mocked(mockDb.restoreRun.update).mock.calls[1]?.[0] as any;
    expect(secondCall.data.status).toBe('completed');

    const verification = JSON.parse(secondCall.data.verificationResult);
    expect(verification.status).toBe('restored_verified');
    expect(verification.parseable).toBe(true);
    expect(verification.restoredBytes).toBe(4096);
  });

  it('marks restore as failed and rethrows when mysql restore command fails', async () => {
    mockAccess.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('dump.sql')) {
        return undefined;
      }
      throw new Error('ENOENT');
    });
    mockExecSync.mockImplementation(() => {
      throw new Error('Command failed: mysql -h localhost -P 3306 -u user -ptestpass campusops_test < "/tmp/campusops-backups/backup-3/dump.sql"');
    });

    const worker = new RestoreWorker();
    await expect(worker.handle({ restoreRunId: 'restore-3', backupId: 'backup-3' })).rejects.toThrow();

    const secondCall = vi.mocked(mockDb.restoreRun.update).mock.calls[1]?.[0] as any;
    expect(secondCall.data.status).toBe('failed');
    const verification = JSON.parse(secondCall.data.verificationResult);
    expect(String(verification.error)).not.toContain('testpass');
    expect(String(verification.error)).toContain('-p[REDACTED]');
  });
});
