import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/memberships/repository.js', () => ({
  findMemberById: vi.fn(),
  findFulfillmentById: vi.fn(),
}));

vi.mock('../src/modules/memberships/service.js', () => ({
  createFulfillment: vi.fn(),
}));

vi.mock('../src/common/encryption/aes256.js', () => ({
  decrypt: vi.fn(() => '123.4500'),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    walletLedgerEntry: {
      findFirst: vi.fn(),
    },
  },
}));

const ctrl = await import('../src/modules/memberships/controller.js');
const repo = await import('../src/modules/memberships/repository.js');
const service = await import('../src/modules/memberships/service.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe('memberships controller unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getMemberHandler returns transformed member payload with decrypted balance', async () => {
    vi.mocked(repo.findMemberById).mockResolvedValue({
      id: 'm-1',
      orgId: 'org-1',
      growthPoints: 10,
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      tier: { name: 'Silver', level: 2 },
      wallet: { encryptedBalance: 'enc', isEnabled: true },
    } as any);

    const req = { params: { id: 'm-1' }, user: { orgId: 'org-1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.getMemberHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ walletBalance: 123.45, tierName: 'Silver' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('getWalletHandler returns not found on org mismatch', async () => {
    vi.mocked(repo.findMemberById).mockResolvedValue({
      id: 'm-1',
      orgId: 'org-2',
      wallet: { id: 'w-1', encryptedBalance: 'enc', isEnabled: true },
    } as any);

    const req = { params: { id: 'm-1' }, user: { orgId: 'org-1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.getWalletHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toBe('Wallet not found');
  });

  it('createFulfillmentHandler returns 201 with service result', async () => {
    vi.mocked(service.createFulfillment).mockResolvedValue({ id: 'f-1', status: 'submitted' } as any);

    const req = { params: { orgId: 'org-1' }, body: { lineItems: [] } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.createFulfillmentHandler(req, res, next);

    expect(service.createFulfillment).toHaveBeenCalledWith('org-1', { lineItems: [] });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'f-1', status: 'submitted' } });
    expect(next).not.toHaveBeenCalled();
  });
});
