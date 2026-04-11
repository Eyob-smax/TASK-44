import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../src/common/logging/logger.js';

/**
 * Unit tests for CarrierSyncWorker connector logic.
 *
 * Tests the three connector types: rest_api, file_drop, and manual.
 * Mocks external I/O (axios, fs) and verifies cursor update semantics.
 */

// Mock database
const mockDb = {
  carrier: { findUnique: vi.fn() },
  shipment: { findUnique: vi.fn() },
  carrierSyncCursor: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};
vi.mock('../src/app/container.js', () => ({ db: mockDb }));

// Mock encryption (connectorConfig is stored encrypted)
vi.mock('../src/common/encryption/aes256.js', () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => v),
}));

// Mock logger
vi.mock('../src/common/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock logistics repository
const mockAddTrackingUpdate = vi.fn().mockResolvedValue({});
const mockUpsertSyncCursor = vi.fn().mockResolvedValue({});
vi.mock('../src/modules/logistics/repository.js', () => ({
  addTrackingUpdate: mockAddTrackingUpdate,
  upsertSyncCursor: mockUpsertSyncCursor,
}));

// Mock axios for rest_api connector
const mockAxiosGet = vi.fn();
vi.mock('axios', () => ({
  default: { get: mockAxiosGet },
}));

// Mock fs for file_drop connector
const mockReaddirSync = vi.fn();
const mockStatSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockRenameSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockExistsSync = vi.fn();
vi.mock('fs', () => ({
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync,
  renameSync: mockRenameSync,
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
}));

const { CarrierSyncWorker } = await import('../src/jobs/workers/carrier-sync-worker.js');

const BASE_CURSOR = {
  carrierId: 'car-1',
  lastSyncAt: new Date('2026-01-01T00:00:00Z'),
  lastSuccessCursor: '2026-01-01T00:00:00.000Z',
  errorState: null,
};

describe('CarrierSyncWorker — manual connector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performs no-op for manual carrier and updates cursor', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-1',
      connectorType: 'manual',
      connectorConfig: null,
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(BASE_CURSOR);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-1' });

    expect(mockAddTrackingUpdate).not.toHaveBeenCalled();
    expect(mockDb.carrierSyncCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { carrierId: 'car-1' },
        update: expect.objectContaining({ errorState: null }),
      }),
    );
  });
});

describe('CarrierSyncWorker — rest_api connector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches tracking updates and calls addTrackingUpdate for each', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-1',
      connectorType: 'rest_api',
      connectorConfig: JSON.stringify({ apiUrl: 'http://carrier.lan/api/tracking', apiKey: 'secret' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(BASE_CURSOR);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    // Both shipments belong to this carrier
    mockDb.shipment.findUnique.mockResolvedValue({ carrierId: 'car-1' });

    mockAxiosGet.mockResolvedValue({
      data: [
        { shipmentId: 'ship-1', status: 'in_transit', location: 'Hub A' },
        { shipmentId: 'ship-2', status: 'delivered', location: 'Front Door' },
      ],
    });

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-1' });

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'http://carrier.lan/api/tracking',
      expect.objectContaining({
        params: expect.objectContaining({ since: expect.any(String) }),
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    );
    expect(mockAddTrackingUpdate).toHaveBeenCalledTimes(2);
    expect(mockAddTrackingUpdate).toHaveBeenCalledWith('ship-1', 'in_transit', 'Hub A', 'carrier_sync');
    expect(mockAddTrackingUpdate).toHaveBeenCalledWith('ship-2', 'delivered', 'Front Door', 'carrier_sync');
  });

  it('sets errorState on cursor when HTTP request fails and rethrows', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-1',
      connectorType: 'rest_api',
      connectorConfig: JSON.stringify({ apiUrl: 'http://carrier.lan/api/tracking' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(BASE_CURSOR);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});

    mockAxiosGet.mockRejectedValue(new Error('Connection refused'));

    const worker = new CarrierSyncWorker();
    await expect(worker.handle({ carrierId: 'car-1' })).rejects.toThrow('Connection refused');

    expect(mockDb.carrierSyncCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ errorState: expect.stringContaining('Connection refused') }),
      }),
    );
  });

  it('handles empty response array without calling addTrackingUpdate', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-1',
      connectorType: 'rest_api',
      connectorConfig: JSON.stringify({ apiUrl: 'http://carrier.lan/api/tracking' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(null);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    mockAxiosGet.mockResolvedValue({ data: [] });

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-1' });

    expect(mockAddTrackingUpdate).not.toHaveBeenCalled();
    expect(mockDb.carrierSyncCursor.upsert).toHaveBeenCalled();
  });
});

describe('CarrierSyncWorker — file_drop connector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes JSON files and calls addTrackingUpdate for each update', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-2',
      connectorType: 'file_drop',
      connectorConfig: JSON.stringify({ watchDirectory: '/data/carrier-drops' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(null);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    mockDb.shipment.findUnique.mockResolvedValue({ carrierId: 'car-2' });
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
    mockReaddirSync.mockReturnValue(['update-001.json', 'readme.txt']);
    mockStatSync.mockReturnValue({ mtime: new Date('2026-02-01T00:00:00Z') });
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ shipmentId: 'ship-3', status: 'out_for_delivery', location: 'Local Hub' }]),
    );
    mockRenameSync.mockReturnValue(undefined);

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-2' });

    expect(mockAddTrackingUpdate).toHaveBeenCalledWith('ship-3', 'out_for_delivery', 'Local Hub', 'carrier_sync');
    expect(mockRenameSync).toHaveBeenCalled();
  });

  it('skips non-JSON files', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-2',
      connectorType: 'file_drop',
      connectorConfig: JSON.stringify({ watchDirectory: '/data/carrier-drops' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(null);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
    mockReaddirSync.mockReturnValue(['readme.txt', 'data.xml']);

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-2' });

    expect(mockReadFileSync).not.toHaveBeenCalled();
    expect(mockAddTrackingUpdate).not.toHaveBeenCalled();
  });

  it('skips files modified before last sync cursor', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-2',
      connectorType: 'file_drop',
      connectorConfig: JSON.stringify({ watchDirectory: '/data/carrier-drops' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue({
      ...BASE_CURSOR,
      lastSyncAt: new Date('2026-03-01T00:00:00Z'),
    });
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
    mockReaddirSync.mockReturnValue(['old-update.json']);
    // File mtime is before cursor — should be skipped
    mockStatSync.mockReturnValue({ mtime: new Date('2026-01-01T00:00:00Z') });

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-2' });

    expect(mockReadFileSync).not.toHaveBeenCalled();
    expect(mockAddTrackingUpdate).not.toHaveBeenCalled();
  });
});

describe('CarrierSyncWorker — carrier not found', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns early without error when carrier does not exist', async () => {
    mockDb.carrier.findUnique.mockResolvedValue(null);

    const worker = new CarrierSyncWorker();
    await expect(worker.handle({ carrierId: 'nonexistent' })).resolves.toBeUndefined();
    expect(mockDb.carrierSyncCursor.upsert).not.toHaveBeenCalled();
  });
});

describe('CarrierSyncWorker — shipment ownership validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rest_api: skips update when shipment belongs to a different carrier', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-1',
      connectorType: 'rest_api',
      connectorConfig: JSON.stringify({ apiUrl: 'http://carrier.lan/api/tracking' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(BASE_CURSOR);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    // Shipment belongs to a different carrier
    mockDb.shipment.findUnique.mockResolvedValue({ carrierId: 'car-OTHER' });

    mockAxiosGet.mockResolvedValue({
      data: [{ shipmentId: 'ship-foreign', status: 'in_transit', location: 'Hub A' }],
    });

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-1' });

    expect(mockAddTrackingUpdate).not.toHaveBeenCalled();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ carrierId: 'car-1', shipmentId: 'ship-foreign' }),
      expect.stringContaining('ownership mismatch'),
    );
  });

  it('rest_api: skips update when shipment does not exist', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-1',
      connectorType: 'rest_api',
      connectorConfig: JSON.stringify({ apiUrl: 'http://carrier.lan/api/tracking' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(BASE_CURSOR);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    mockDb.shipment.findUnique.mockResolvedValue(null);

    mockAxiosGet.mockResolvedValue({
      data: [{ shipmentId: 'ship-ghost', status: 'delivered', location: null }],
    });

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-1' });

    expect(mockAddTrackingUpdate).not.toHaveBeenCalled();
  });

  it('file_drop: skips update when shipment belongs to a different carrier', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-2',
      connectorType: 'file_drop',
      connectorConfig: JSON.stringify({ watchDirectory: '/data/carrier-drops' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(null);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    // Shipment belongs to a different carrier
    mockDb.shipment.findUnique.mockResolvedValue({ carrierId: 'car-OTHER' });
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
    mockReaddirSync.mockReturnValue(['update-002.json']);
    mockStatSync.mockReturnValue({ mtime: new Date('2026-02-01T00:00:00Z') });
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ shipmentId: 'ship-foreign', status: 'shipped', location: 'Hub B' }]),
    );
    mockRenameSync.mockReturnValue(undefined);

    const worker = new CarrierSyncWorker();
    await worker.handle({ carrierId: 'car-2' });

    expect(mockAddTrackingUpdate).not.toHaveBeenCalled();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ carrierId: 'car-2', shipmentId: 'ship-foreign' }),
      expect.stringContaining('ownership mismatch'),
    );
  });
});

describe('CarrierSyncWorker — LAN URL enforcement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects rest_api carrier with external internet URL and sets errorState', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-ext',
      connectorType: 'rest_api',
      connectorConfig: JSON.stringify({ apiUrl: 'https://carrier.example.com/api/tracking' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(null);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});

    const worker = new CarrierSyncWorker();
    await expect(worker.handle({ carrierId: 'car-ext' })).rejects.toThrow(
      /LAN-local|rejected/i,
    );
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockDb.carrierSyncCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ errorState: expect.stringContaining('carrier.example.com') }),
      }),
    );
  });

  it('accepts rest_api carrier with a .lan hostname', async () => {
    mockDb.carrier.findUnique.mockResolvedValue({
      id: 'car-lan',
      connectorType: 'rest_api',
      connectorConfig: JSON.stringify({ apiUrl: 'http://carrier.lan/api/tracking' }),
    });
    mockDb.carrierSyncCursor.findUnique.mockResolvedValue(null);
    mockDb.carrierSyncCursor.upsert.mockResolvedValue({});
    mockAxiosGet.mockResolvedValue({ data: [] });

    const worker = new CarrierSyncWorker();
    await expect(worker.handle({ carrierId: 'car-lan' })).resolves.toBeUndefined();
    expect(mockAxiosGet).toHaveBeenCalled();
  });
});
