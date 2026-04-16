import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/container.js', () => ({
  db: {
    anomalyResolution: {
      create: vi.fn(),
    },
    anomalyEvent: {
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn({
      anomalyResolution: { create: vi.fn().mockResolvedValue({ id: 'res-1' }) },
      anomalyEvent: { update: vi.fn().mockResolvedValue({}) },
    })),
  },
}));

const repo = await import('../src/modules/classroom-ops/repository.js');

describe('classroom-ops repository unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createResolution rejects empty note', async () => {
    await expect(repo.createResolution('anom-1', 'u1', '   ')).rejects.toThrow('Resolution note is required');
  });

  it('createResolution stores trimmed note inside transaction', async () => {
    const result = await repo.createResolution('anom-1', 'u1', ' fixed ');
    expect(result).toEqual({ id: 'res-1' });
  });
});
