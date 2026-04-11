import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/modules/after-sales/repository.js', () => ({
  findShipmentOrgById: vi.fn(),
  findParcelWithShipmentOrgById: vi.fn(),
  createTicket: vi.fn(),
}));

const service = await import('../src/modules/after-sales/service.js');
const repo = await import('../src/modules/after-sales/repository.js');

describe('after-sales createTicket ownership validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when shipment does not belong to the ticket org', async () => {
    vi.mocked(repo.findShipmentOrgById).mockResolvedValue({
      id: 'ship-1',
      warehouse: { orgId: 'org-2' },
    } as any);

    await expect(
      service.createTicket('org-1', 'user-1', {
        type: 'delay',
        shipmentId: 'ship-1',
        description: 'Late shipment',
      } as any),
    ).rejects.toThrow('Shipment not found');
  });

  it('rejects when parcel does not belong to the ticket org', async () => {
    vi.mocked(repo.findParcelWithShipmentOrgById).mockResolvedValue({
      id: 'parcel-1',
      shipmentId: 'ship-1',
      shipment: { warehouse: { orgId: 'org-2' } },
    } as any);

    await expect(
      service.createTicket('org-1', 'user-1', {
        type: 'dispute',
        parcelId: 'parcel-1',
        description: 'Wrong parcel',
      } as any),
    ).rejects.toThrow('Parcel not found');
  });

  it('rejects when provided parcel does not belong to provided shipment', async () => {
    vi.mocked(repo.findShipmentOrgById).mockResolvedValue({
      id: 'ship-1',
      warehouse: { orgId: 'org-1' },
    } as any);
    vi.mocked(repo.findParcelWithShipmentOrgById).mockResolvedValue({
      id: 'parcel-1',
      shipmentId: 'ship-2',
      shipment: { warehouse: { orgId: 'org-1' } },
    } as any);

    await expect(
      service.createTicket('org-1', 'user-1', {
        type: 'lost_item',
        shipmentId: 'ship-1',
        parcelId: 'parcel-1',
        description: 'Parcel mismatch',
      } as any),
    ).rejects.toThrow('Parcel not found');
  });

  it('creates ticket when shipment and parcel belong to the same org and linkage', async () => {
    vi.mocked(repo.findShipmentOrgById).mockResolvedValue({
      id: 'ship-1',
      warehouse: { orgId: 'org-1' },
    } as any);
    vi.mocked(repo.findParcelWithShipmentOrgById).mockResolvedValue({
      id: 'parcel-1',
      shipmentId: 'ship-1',
      shipment: { warehouse: { orgId: 'org-1' } },
    } as any);
    vi.mocked(repo.createTicket).mockResolvedValue({ id: 'ticket-1' } as any);

    const result = await service.createTicket('org-1', 'user-1', {
      type: 'delay',
      shipmentId: 'ship-1',
      parcelId: 'parcel-1',
      description: 'Late and disputed',
      priority: 'high',
    } as any);

    expect(result).toEqual({ id: 'ticket-1' });
    expect(repo.createTicket).toHaveBeenCalledTimes(1);
  });
});
