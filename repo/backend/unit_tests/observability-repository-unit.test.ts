import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/common/encryption/aes256.js', () => ({
  decrypt: vi.fn((v: string) => `dec(${v})`),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    applicationLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    alertThreshold: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const repo = await import('../src/modules/observability/repository.js');
const { db } = await import('../src/app/container.js');

describe('observability repository unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searchLogs decrypts message/context when possible', async () => {
    vi.mocked(db.applicationLog.findMany).mockResolvedValue([
      { message: 'cipher', context: 'ctx', level: 'info' },
    ] as any);
    vi.mocked(db.applicationLog.count).mockResolvedValue(1 as any);

    const result = await repo.searchLogs({ search: 'x' }, 1, 10, 'org-1');

    expect(result.logs[0]?.message).toBe('dec(cipher)');
    expect(result.logs[0]?.context).toBe('dec(ctx)');
  });

  it('updateAlertThreshold enforces org ownership', async () => {
    vi.mocked(db.alertThreshold.findUnique).mockResolvedValue({ id: 'th-1', orgId: 'org-2' } as any);

    await expect(repo.updateAlertThreshold('th-1', { isActive: false }, 'org-1')).rejects.toThrow('not found');
  });
});
