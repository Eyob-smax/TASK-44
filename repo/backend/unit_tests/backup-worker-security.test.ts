import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'mysql://user:topsecret@localhost:3306/campusops_test');

const mockDb = {
  backupRecord: {
    update: vi.fn(),
  },
};

const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();
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
vi.mock('../src/modules/backups/repository.js', () => ({
  deleteExpiredBackups: vi.fn().mockResolvedValue({ count: 0, fileCount: 0 }),
}));
vi.mock('fs/promises', () => ({
  default: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    stat: mockStat,
  },
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  stat: mockStat,
}));
vi.mock('child_process', () => ({ execSync: mockExecSync }));

const { BackupWorker } = await import('../src/jobs/workers/backup-worker.js');

describe('BackupWorker command security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStat.mockResolvedValue({ size: 1024 });
    mockExecSync.mockImplementation(() => undefined);
  });

  it('runs mysqldump without inline password and passes MYSQL_PWD via env', async () => {
    const worker = new BackupWorker();
    await worker.handle({ backupId: 'backup-1', type: 'full', storagePath: '/tmp/path' });

    expect(mockExecSync).toHaveBeenCalledTimes(1);
    const [command, options] = vi.mocked(mockExecSync).mock.calls[0] as [string, any];

    expect(command).toContain('mysqldump -h localhost -P 3306 -u user campusops_test >');
    expect(command).not.toContain('-ptopsecret');
    expect(options.env.MYSQL_PWD).toBe('topsecret');
  });
});
