import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRepo = {
  findTemplateByRegionAndTier: vi.fn(),
  findWarehouseById: vi.fn(),
  findCarrierById: vi.fn(),
  createShipment: vi.fn(),
  findShipmentById: vi.fn(),
  addTrackingUpdate: vi.fn(),
  updateShipmentStatus: vi.fn(),
};

vi.mock('../src/modules/logistics/repository.js', () => mockRepo);
vi.mock('../src/app/container.js', () => ({ db: {} }));

const service = await import('../src/modules/logistics/service.js');

const ORG_ID = 'org-1';
const OTHER_ORG = 'org-other';

beforeEach(() => vi.clearAllMocks());

// ============================================================================
// calculateFee
// ============================================================================

describe('calculateFee', () => {
  const baseInput = {
    weightLb: 5,
    itemCount: 2,
    regionCode: 'US-CA',
    tier: 'standard' as const,
    applicableSurcharges: [] as string[],
  };

  it('throws NotFoundError when no template matches region/tier/itemCount', async () => {
    mockRepo.findTemplateByRegionAndTier.mockResolvedValue(null);
    await expect(service.calculateFee(ORG_ID, baseInput)).rejects.toThrow(
      /No active shipping fee template found/,
    );
    expect(mockRepo.findTemplateByRegionAndTier).toHaveBeenCalledWith(
      ORG_ID,
      'US-CA',
      'standard',
      2,
    );
  });

  it('calculates base-only fee when weight is at/under baseWeightLb and no surcharges apply', async () => {
    mockRepo.findTemplateByRegionAndTier.mockResolvedValue({
      id: 'tmpl-1',
      baseFee: { toString: () => '10.00' },
      baseWeightLb: { toString: () => '5' },
      perAdditionalLbFee: { toString: () => '2.50' },
      surcharges: [],
    });
    const result = await service.calculateFee(ORG_ID, { ...baseInput, weightLb: 5 });
    expect(result.baseFee).toBe(10);
    expect(result.additionalWeightFee).toBe(0);
    expect(result.surchargeTotal).toBe(0);
    expect(result.totalFee).toBe(10);
    expect(result.templateId).toBe('tmpl-1');
  });

  it('adds per-lb overage fee when weight exceeds baseWeightLb', async () => {
    mockRepo.findTemplateByRegionAndTier.mockResolvedValue({
      id: 'tmpl-1',
      baseFee: { toString: () => '10' },
      baseWeightLb: { toString: () => '5' },
      perAdditionalLbFee: { toString: () => '2' },
      surcharges: [],
    });
    const result = await service.calculateFee(ORG_ID, { ...baseInput, weightLb: 8 });
    // 10 base + (8-5)*2 = 16
    expect(result.additionalWeightFee).toBe(6);
    expect(result.totalFee).toBe(16);
  });

  it('adds only surcharges whose condition is in applicableSurcharges', async () => {
    mockRepo.findTemplateByRegionAndTier.mockResolvedValue({
      id: 'tmpl-1',
      baseFee: { toString: () => '10' },
      baseWeightLb: { toString: () => '5' },
      perAdditionalLbFee: { toString: () => '2' },
      surcharges: [
        { condition: 'remote_area', surchargeAmount: { toString: () => '5' } },
        { condition: 'saturday', surchargeAmount: { toString: () => '3' } },
        { condition: 'oversize', surchargeAmount: { toString: () => '8' } },
      ],
    });
    const result = await service.calculateFee(ORG_ID, {
      ...baseInput,
      weightLb: 5,
      applicableSurcharges: ['remote_area', 'saturday'],
    });
    // 10 base + 0 overage + 5 + 3 = 18
    expect(result.surchargeTotal).toBe(8);
    expect(result.totalFee).toBe(18);
    // breakdown contains both applicable surcharges
    const surchargeLabels = result.breakdown.filter((b) => b.label.startsWith('Surcharge:'));
    expect(surchargeLabels).toHaveLength(2);
  });
});

// ============================================================================
// createShipment
// ============================================================================

describe('createShipment', () => {
  const validData = {
    warehouseId: 'wh-1',
    carrierId: 'car-1',
    parcels: [{ description: 'Box', weightLb: 2, quantity: 1 }],
  };

  it('throws NotFoundError when warehouse does not exist', async () => {
    mockRepo.findWarehouseById.mockResolvedValue(null);
    await expect(service.createShipment(ORG_ID, validData)).rejects.toThrow(
      /Warehouse not found in this organization/,
    );
    expect(mockRepo.createShipment).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when warehouse belongs to a different org (cross-tenant)', async () => {
    mockRepo.findWarehouseById.mockResolvedValue({ id: 'wh-1', orgId: OTHER_ORG });
    await expect(service.createShipment(ORG_ID, validData)).rejects.toThrow(
      /Warehouse not found in this organization/,
    );
    expect(mockRepo.findCarrierById).not.toHaveBeenCalled();
    expect(mockRepo.createShipment).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when carrier does not exist', async () => {
    mockRepo.findWarehouseById.mockResolvedValue({ id: 'wh-1', orgId: ORG_ID });
    mockRepo.findCarrierById.mockResolvedValue(null);
    await expect(service.createShipment(ORG_ID, validData)).rejects.toThrow(
      /Carrier not found in this organization/,
    );
    expect(mockRepo.createShipment).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when carrier belongs to a different org (cross-tenant)', async () => {
    mockRepo.findWarehouseById.mockResolvedValue({ id: 'wh-1', orgId: ORG_ID });
    mockRepo.findCarrierById.mockResolvedValue({ id: 'car-1', orgId: OTHER_ORG });
    await expect(service.createShipment(ORG_ID, validData)).rejects.toThrow(
      /Carrier not found in this organization/,
    );
    expect(mockRepo.createShipment).not.toHaveBeenCalled();
  });

  it('creates shipment when warehouse and carrier are both in-org', async () => {
    mockRepo.findWarehouseById.mockResolvedValue({ id: 'wh-1', orgId: ORG_ID });
    mockRepo.findCarrierById.mockResolvedValue({ id: 'car-1', orgId: ORG_ID });
    mockRepo.createShipment.mockResolvedValue({ id: 'shp-1' });

    const result = await service.createShipment(ORG_ID, validData);
    expect(mockRepo.createShipment).toHaveBeenCalledWith(validData);
    expect(result).toMatchObject({ id: 'shp-1' });
  });
});

// ============================================================================
// recordTrackingUpdate
// ============================================================================

describe('recordTrackingUpdate', () => {
  it('throws NotFoundError when shipment does not exist', async () => {
    mockRepo.findShipmentById.mockResolvedValue(null);
    await expect(
      service.recordTrackingUpdate('missing', 'shipped', null, 'manual'),
    ).rejects.toThrow(/Shipment not found/);
    expect(mockRepo.addTrackingUpdate).not.toHaveBeenCalled();
    expect(mockRepo.updateShipmentStatus).not.toHaveBeenCalled();
  });

  it('records tracking update and marks shipment shipped with shippedAt', async () => {
    mockRepo.findShipmentById.mockResolvedValue({ id: 'shp-1' });
    await service.recordTrackingUpdate('shp-1', 'shipped', 'Warehouse A', 'carrier_sync');
    expect(mockRepo.addTrackingUpdate).toHaveBeenCalledWith(
      'shp-1',
      'shipped',
      'Warehouse A',
      'carrier_sync',
    );
    expect(mockRepo.updateShipmentStatus).toHaveBeenCalledWith(
      'shp-1',
      'shipped',
      expect.objectContaining({ shippedAt: expect.any(Date) }),
    );
  });

  it('records tracking update and marks shipment in_transit without timestamp metadata', async () => {
    mockRepo.findShipmentById.mockResolvedValue({ id: 'shp-1' });
    await service.recordTrackingUpdate('shp-1', 'in_transit', 'Hub B', 'carrier_sync');
    expect(mockRepo.updateShipmentStatus).toHaveBeenCalledWith('shp-1', 'in_transit');
  });

  it('records tracking update and marks shipment delivered with deliveredAt', async () => {
    mockRepo.findShipmentById.mockResolvedValue({ id: 'shp-1' });
    await service.recordTrackingUpdate('shp-1', 'delivered', 'Customer address', 'manual');
    expect(mockRepo.updateShipmentStatus).toHaveBeenCalledWith(
      'shp-1',
      'delivered',
      expect.objectContaining({ deliveredAt: expect.any(Date) }),
    );
  });

  it('records tracking update but does NOT change shipment status for unrelated status like "exception"', async () => {
    mockRepo.findShipmentById.mockResolvedValue({ id: 'shp-1' });
    await service.recordTrackingUpdate('shp-1', 'exception', null, 'manual');
    expect(mockRepo.addTrackingUpdate).toHaveBeenCalled();
    expect(mockRepo.updateShipmentStatus).not.toHaveBeenCalled();
  });
});

// ============================================================================
// getShipmentWithDetails
// ============================================================================

describe('getShipmentWithDetails', () => {
  it('throws NotFoundError when shipment does not exist', async () => {
    mockRepo.findShipmentById.mockResolvedValue(null);
    await expect(service.getShipmentWithDetails('missing')).rejects.toThrow(/Shipment not found/);
  });

  it('returns the shipment with whatever shape the repo returns', async () => {
    const shipment = {
      id: 'shp-1',
      warehouseId: 'wh-1',
      carrierId: 'car-1',
      status: 'shipped',
      parcels: [],
      trackingUpdates: [],
    };
    mockRepo.findShipmentById.mockResolvedValue(shipment);
    const result = await service.getShipmentWithDetails('shp-1');
    expect(result).toBe(shipment);
  });
});
