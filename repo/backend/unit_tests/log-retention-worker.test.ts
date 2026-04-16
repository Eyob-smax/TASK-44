import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  applicationLog: {
    deleteMany: vi.fn(),
  },
};

vi.mock('../src/app/container.js', () => ({ db: mockDb }));
vi.mock('../src/common/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../src/modules/configuration/service.js', () => ({
  getConfig: vi.fn(() => ({ config: { logRetentionDays: 30 } })),
}));

const { LogRetentionWorker } = await import('../src/jobs/workers/log-retention-worker.js');
const { getConfig } = await import('../src/modules/configuration/service.js');

describe('LogRetentionWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({ config: { logRetentionDays: 30 } } as any);
  });

  it('deletes application logs older than the configured retention cutoff', async () => {
    mockDb.applicationLog.deleteMany.mockResolvedValue({ count: 42 });

    const before = Date.now();
    const worker = new LogRetentionWorker();
    await worker.handle({});
    const after = Date.now();

    expect(mockDb.applicationLog.deleteMany).toHaveBeenCalledTimes(1);
    const call = mockDb.applicationLog.deleteMany.mock.calls[0][0] as {
      where: { timestamp: { lt: Date } };
    };
    const cutoff = call.where.timestamp.lt.getTime();
    // Cutoff should be approximately 30 days before "now"
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(cutoff).toBeGreaterThanOrEqual(before - thirtyDaysMs - 100);
    expect(cutoff).toBeLessThanOrEqual(after - thirtyDaysMs + 100);
  });

  it('honors a custom retention window from configuration', async () => {
    vi.mocked(getConfig).mockReturnValue({ config: { logRetentionDays: 7 } } as any);
    mockDb.applicationLog.deleteMany.mockResolvedValue({ count: 0 });

    const before = Date.now();
    const worker = new LogRetentionWorker();
    await worker.handle({});
    const after = Date.now();

    const call = mockDb.applicationLog.deleteMany.mock.calls[0][0] as {
      where: { timestamp: { lt: Date } };
    };
    const cutoff = call.where.timestamp.lt.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(cutoff).toBeGreaterThanOrEqual(before - sevenDaysMs - 100);
    expect(cutoff).toBeLessThanOrEqual(after - sevenDaysMs + 100);
  });

  it('exposes log_retention as its worker type', () => {
    expect(new LogRetentionWorker().type).toBe('log_retention');
  });

  it('still completes when no rows are deleted', async () => {
    mockDb.applicationLog.deleteMany.mockResolvedValue({ count: 0 });

    const worker = new LogRetentionWorker();
    await expect(worker.handle({})).resolves.toBeUndefined();
    expect(mockDb.applicationLog.deleteMany).toHaveBeenCalledTimes(1);
  });
});
