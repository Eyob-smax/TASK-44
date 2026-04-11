import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/api-client.js', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

const { post } = await import('../src/services/api-client.js');
const { logisticsService } = await import('../src/services/logistics.service.js');
const { membershipsService } = await import('../src/services/memberships.service.js');

describe('Idempotency header transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(post).mockResolvedValue({} as any);
  });

  it('sends shipment idempotency key in X-Idempotency-Key header', async () => {
    await logisticsService.createShipment('org-1', {
      warehouseId: 'warehouse-1',
      carrierId: 'carrier-1',
      parcels: [{ description: 'Laptop', weightLb: 2.5, quantity: 1 }],
      idempotencyKey: 'idem-shipment-1',
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      '/shipments',
      expect.objectContaining({
        orgId: 'org-1',
        warehouseId: 'warehouse-1',
        carrierId: 'carrier-1',
      }),
      { headers: { 'X-Idempotency-Key': 'idem-shipment-1' } },
    );

    const body = vi.mocked(post).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.idempotencyKey).toBeUndefined();
  });

  it('sends wallet top-up idempotency key in X-Idempotency-Key header', async () => {
    await membershipsService.topUpWallet('member-1', 25, 'idem-topup-1');

    expect(post).toHaveBeenCalledWith(
      '/members/member-1/wallet/topup',
      { amount: 25 },
      { headers: { 'X-Idempotency-Key': 'idem-topup-1' } },
    );
  });

  it('sends wallet spend idempotency key in X-Idempotency-Key header', async () => {
    await membershipsService.spendFromWallet('member-1', 10, 'idem-spend-1');

    expect(post).toHaveBeenCalledWith(
      '/members/member-1/wallet/spend',
      { amount: 10 },
      { headers: { 'X-Idempotency-Key': 'idem-spend-1' } },
    );
  });
});
