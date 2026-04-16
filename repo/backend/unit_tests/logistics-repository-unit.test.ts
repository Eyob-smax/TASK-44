import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/common/encryption/aes256.js', () => ({
  encrypt: vi.fn((value: string) => `enc(${value})`),
  decrypt: vi.fn((value: string) => `dec(${value})`),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    carrier: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    nonServiceableZip: {
      findUnique: vi.fn(),
    },
  },
}));

const { db } = await import('../src/app/container.js');
const { encrypt, decrypt } = await import('../src/common/encryption/aes256.js');
const repo = await import('../src/modules/logistics/repository.js');

describe('logistics repository unit coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createCarrier encrypts connector config before persistence', async () => {
    vi.mocked(db.carrier.create).mockResolvedValue({ id: 'carrier-1' } as any);

    await repo.createCarrier('org-1', {
      name: 'Campus Carrier',
      connectorType: 'rest_api',
      connectorConfig: '{"token":"abc"}',
    });

    expect(encrypt).toHaveBeenCalledWith('{"token":"abc"}');
    expect(db.carrier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: 'org-1',
        name: 'Campus Carrier',
        connectorType: 'rest_api',
        connectorConfig: 'enc({"token":"abc"})',
      }),
    });
  });

  it('findCarrierById decrypts stored config when carrier exists', async () => {
    vi.mocked(db.carrier.findUnique).mockResolvedValue({
      id: 'carrier-2',
      connectorConfig: 'ciphertext',
      name: 'Carrier 2',
    } as any);

    const carrier = await repo.findCarrierById('carrier-2');

    expect(decrypt).toHaveBeenCalledWith('ciphertext');
    expect(carrier).toMatchObject({
      id: 'carrier-2',
      name: 'Carrier 2',
      connectorConfig: 'dec(ciphertext)',
    });
  });

  it('listCarriers queries active carriers with safe projection', async () => {
    vi.mocked(db.carrier.findMany).mockResolvedValue([] as any);

    await repo.listCarriers('org-1');

    expect(db.carrier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'org-1', isActive: true },
        orderBy: { name: 'asc' },
        select: expect.objectContaining({
          id: true,
          orgId: true,
          name: true,
          connectorType: true,
          isActive: true,
        }),
      }),
    );
  });

  it('isZipServiceable returns false when non-serviceable zip exists', async () => {
    vi.mocked(db.nonServiceableZip.findUnique).mockResolvedValue({ id: 'zip-1' } as any);

    const serviceable = await repo.isZipServiceable('org-1', '99999');

    expect(serviceable).toBe(false);
  });
});
