import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/common/encryption/aes256.js', () => ({
  encrypt: vi.fn((v: string) => `enc(${v})`),
  decrypt: vi.fn(() => '10.0000'),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    membershipTier: {
      findUnique: vi.fn(),
    },
    member: {
      create: vi.fn(),
    },
    storedValueWallet: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    walletLedgerEntry: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn({
      storedValueWallet: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'w1', encryptedBalance: 'enc' }),
        update: vi.fn().mockResolvedValue({}),
      },
      walletLedgerEntry: {
        create: vi.fn().mockResolvedValue({ id: 'le-1', balanceAfter: 15 }),
      },
    })),
  },
}));

const repo = await import('../src/modules/memberships/repository.js');
const { db } = await import('../src/app/container.js');

describe('memberships repository unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createMember throws when tier does not belong to org', async () => {
    vi.mocked(db.membershipTier.findUnique).mockResolvedValue({ id: 'tier-1', orgId: 'org-other' } as any);

    await expect(repo.createMember('org-1', { tierId: 'tier-1' } as any)).rejects.toThrow('Membership tier not found');
  });

  it('topUpWallet creates ledger entry with updated balance', async () => {
    const entry = await repo.topUpWallet('wallet-1', 5, 'manual', 'ref-1');
    expect(entry).toMatchObject({ id: 'le-1' });
  });
});
