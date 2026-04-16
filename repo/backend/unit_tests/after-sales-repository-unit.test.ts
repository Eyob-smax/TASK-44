import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/container.js', () => ({
  db: {
    afterSalesTicket: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    compensationSuggestion: {
      findMany: vi.fn(),
    },
  },
}));

const repo = await import('../src/modules/after-sales/repository.js');
const { db } = await import('../src/app/container.js');

describe('after-sales repository unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listTickets queries paginated tickets with filters', async () => {
    vi.mocked(db.afterSalesTicket.findMany).mockResolvedValue([] as any);
    vi.mocked(db.afterSalesTicket.count).mockResolvedValue(0 as any);

    await repo.listTickets('org-1', { status: 'open' }, { page: 2, limit: 10 });

    expect(db.afterSalesTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orgId: 'org-1', status: 'open' }),
      skip: 10,
      take: 10,
    }));
  });

  it('findApprovedSuggestionsTotal sums decimal amounts', async () => {
    vi.mocked(db.compensationSuggestion.findMany).mockResolvedValue([
      { suggestedAmount: 10.5 },
      { suggestedAmount: 2.25 },
    ] as any);

    const total = await repo.findApprovedSuggestionsTotal('ticket-1');

    expect(total).toBeCloseTo(12.75);
  });
});
