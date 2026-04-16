import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-for-unit-tests');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'integration-signing-secret-for-unit-tests');
vi.stubEnv('BACKUP_PATH', '/var/backups/test');

const mockRepo = {
  createBackupRecord: vi.fn(),
  listBackupRecords: vi.fn(),
  findBackupById: vi.fn(),
  createRestoreRun: vi.fn(),
  listRestoreRuns: vi.fn(),
};

const mockEnqueueJob = vi.fn();

vi.mock('../src/modules/backups/repository.js', () => mockRepo);
vi.mock('../src/jobs/job-monitor.js', () => ({ enqueueJob: mockEnqueueJob }));
vi.mock('../src/app/container.js', () => ({ db: {} }));

const service = await import('../src/modules/backups/service.js');

beforeEach(() => vi.clearAllMocks());

// ============================================================================
// triggerBackup
// ============================================================================

describe('triggerBackup', () => {
  it('defaults to FULL backup type and uses date-prefixed storage path', async () => {
    mockRepo.createBackupRecord.mockResolvedValue({ id: 'bk-1' });

    const result = await service.triggerBackup();
    const createCall = mockRepo.createBackupRecord.mock.calls[0];
    expect(createCall[0]).toBe('full');
    // Path ends with YYYY-MM-DD
    expect(createCall[1]).toMatch(/\/var\/backups\/test\/\d{4}-\d{2}-\d{2}$/);

    expect(mockEnqueueJob).toHaveBeenCalledWith('backup', {
      backupId: 'bk-1',
      type: 'full',
      storagePath: createCall[1],
    });
    expect(result).toEqual({ backupId: 'bk-1' });
  });

  it('passes explicit backup type to repo and job payload', async () => {
    mockRepo.createBackupRecord.mockResolvedValue({ id: 'bk-2' });
    await service.triggerBackup('incremental');
    expect(mockRepo.createBackupRecord).toHaveBeenCalledWith(
      'incremental',
      expect.any(String),
    );
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      'backup',
      expect.objectContaining({ type: 'incremental' }),
    );
  });
});

// ============================================================================
// listBackups
// ============================================================================

describe('listBackups', () => {
  it('maps repo records to BackupRecordResponse with ISO timestamps', async () => {
    mockRepo.listBackupRecords.mockResolvedValue([
      {
        id: 'bk-1',
        type: 'full',
        status: 'completed',
        sizeBytes: BigInt(1024 * 1024),
        startedAt: new Date('2026-04-15T10:00:00Z'),
        completedAt: new Date('2026-04-15T10:30:00Z'),
        expiresAt: new Date('2026-05-15T10:00:00Z'),
      },
      {
        id: 'bk-2',
        type: 'incremental',
        status: 'running',
        sizeBytes: null,
        startedAt: new Date('2026-04-15T11:00:00Z'),
        completedAt: null,
        expiresAt: new Date('2026-04-22T11:00:00Z'),
      },
    ]);

    const result = await service.listBackups();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'bk-1',
      type: 'full',
      status: 'completed',
      sizeBytes: (BigInt(1024 * 1024)).toString(),
      startedAt: '2026-04-15T10:00:00.000Z',
      completedAt: '2026-04-15T10:30:00.000Z',
      expiresAt: '2026-05-15T10:00:00.000Z',
    });
    expect(result[1].sizeBytes).toBeNull();
    expect(result[1].completedAt).toBeNull();
  });

  it('returns [] when no backup records exist', async () => {
    mockRepo.listBackupRecords.mockResolvedValue([]);
    expect(await service.listBackups()).toEqual([]);
  });
});

// ============================================================================
// getBackupById
// ============================================================================

describe('getBackupById', () => {
  it('returns null when backup does not exist', async () => {
    mockRepo.findBackupById.mockResolvedValue(null);
    expect(await service.getBackupById('missing')).toBeNull();
  });

  it('parses JSON verificationResult on restore runs and formats performedBy', async () => {
    mockRepo.findBackupById.mockResolvedValue({
      id: 'bk-1',
      type: 'full',
      status: 'completed',
      sizeBytes: BigInt(1000),
      startedAt: new Date('2026-04-15T10:00:00Z'),
      completedAt: new Date('2026-04-15T10:30:00Z'),
      expiresAt: new Date('2026-05-15T10:00:00Z'),
      restoreRuns: [
        {
          id: 'run-1',
          status: 'completed',
          verificationResult: JSON.stringify({ objectStorageManifestPresent: true }),
          performedBy: { username: 'admin' },
          startedAt: new Date('2026-04-15T12:00:00Z'),
          completedAt: new Date('2026-04-15T12:05:00Z'),
        },
        {
          id: 'run-2',
          status: 'failed',
          verificationResult: null,
          performedBy: null,
          startedAt: new Date('2026-04-15T13:00:00Z'),
          completedAt: null,
        },
      ],
    });

    const result = await service.getBackupById('bk-1');
    expect(result!.id).toBe('bk-1');
    expect(result!.restoreRuns).toHaveLength(2);
    expect(result!.restoreRuns[0].verificationResult).toEqual({
      objectStorageManifestPresent: true,
    });
    expect(result!.restoreRuns[0].performedBy).toBe('admin');
    expect(result!.restoreRuns[1].verificationResult).toBeNull();
    expect(result!.restoreRuns[1].performedBy).toBeNull();
    expect(result!.restoreRuns[1].completedAt).toBeNull();
  });
});

// ============================================================================
// triggerRestore
// ============================================================================

describe('triggerRestore', () => {
  it('creates restore run and enqueues restore job', async () => {
    mockRepo.createRestoreRun.mockResolvedValue({ id: 'run-1' });

    const result = await service.triggerRestore('bk-1', 'usr-1');
    expect(mockRepo.createRestoreRun).toHaveBeenCalledWith('bk-1', 'usr-1');
    expect(mockEnqueueJob).toHaveBeenCalledWith('restore', {
      restoreRunId: 'run-1',
      backupId: 'bk-1',
    });
    expect(result).toEqual({ restoreRunId: 'run-1' });
  });
});

// ============================================================================
// listRestoreRuns
// ============================================================================

describe('listRestoreRuns', () => {
  it('maps runs with username fallback to performedByUserId when performedBy is null', async () => {
    mockRepo.listRestoreRuns.mockResolvedValue([
      {
        id: 'run-1',
        backupId: 'bk-1',
        status: 'completed',
        verificationResult: JSON.stringify({ dumpExists: true }),
        performedBy: { username: 'admin' },
        performedByUserId: 'usr-1',
        startedAt: new Date('2026-04-15T10:00:00Z'),
        completedAt: new Date('2026-04-15T10:05:00Z'),
      },
      {
        id: 'run-2',
        backupId: 'bk-2',
        status: 'failed',
        verificationResult: null,
        performedBy: null,
        performedByUserId: 'usr-2',
        startedAt: new Date('2026-04-15T11:00:00Z'),
        completedAt: null,
      },
    ]);

    const result = await service.listRestoreRuns();
    expect(result[0].performedBy).toBe('admin');
    expect(result[0].verificationResult).toEqual({ dumpExists: true });
    expect(result[1].performedBy).toBe('usr-2'); // fallback
    expect(result[1].verificationResult).toBeNull();
    expect(result[1].completedAt).toBeNull();
  });

  it('returns [] when no restore runs exist', async () => {
    mockRepo.listRestoreRuns.mockResolvedValue([]);
    expect(await service.listRestoreRuns()).toEqual([]);
  });
});
