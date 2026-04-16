import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/container.js', () => ({
  db: {
    parkingException: {
      update: vi.fn(),
      count: vi.fn(),
    },
    parkingFacility: {
      findUnique: vi.fn(),
    },
    parkingSession: {
      count: vi.fn(),
    },
    parkingEvent: {
      count: vi.fn(),
    },
  },
}));

const repo = await import('../src/modules/parking/repository.js');
const { db } = await import('../src/app/container.js');

describe('parking repository unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolveException requires non-empty resolution note', async () => {
    await expect(repo.resolveException('ex-1', '   ')).rejects.toThrow('Resolution note is required');
  });

  it('getParkingStatus computes capacity fields from counts', async () => {
    vi.mocked(db.parkingFacility.findUnique).mockResolvedValue({
      id: 'fac-1',
      name: 'Main Lot',
      totalSpaces: 100,
      campus: { orgId: 'org-1' },
    } as any);
    vi.mocked(db.parkingSession.count).mockResolvedValue(8 as any);
    vi.mocked(db.parkingEvent.count).mockResolvedValue(20 as any);
    vi.mocked(db.parkingException.count)
      .mockResolvedValueOnce(2 as any)
      .mockResolvedValueOnce(1 as any);

    const status = await repo.getParkingStatus('fac-1', 'org-1');

    expect(status.occupiedSpaces).toBe(8);
    expect(status.availableSpaces).toBe(92);
    expect(status.openExceptions).toBe(2);
    expect(status.escalatedExceptions).toBe(1);
  });
});
