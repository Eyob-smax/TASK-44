import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/logistics/service.js', () => ({
  calculateFee: vi.fn(),
  recordTrackingUpdate: vi.fn(),
  createShipment: vi.fn(),
}));

vi.mock('../src/modules/logistics/repository.js', () => ({
  findShipmentById: vi.fn(),
}));

const ctrl = await import('../src/modules/logistics/controller.js');
const service = await import('../src/modules/logistics/service.js');
const repo = await import('../src/modules/logistics/repository.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe('logistics controller unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calculateShippingFeeHandler validates required query fields', async () => {
    const req = { params: { orgId: 'org-1' }, query: {} } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.calculateShippingFeeHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toContain('required');
  });

  it('createShipmentHandler blocks cross-org write', async () => {
    const req = {
      body: { orgId: 'org-target' },
      user: { orgId: 'org-other' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.createShipmentHandler(req, res, next);

    expect(service.createShipment).not.toHaveBeenCalled();
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toBe('Organization not found');
  });

  it('addTrackingUpdateHandler records update and returns success payload', async () => {
    vi.mocked(repo.findShipmentById).mockResolvedValue({
      id: 's-1',
      warehouse: { orgId: 'org-1' },
    } as any);
    vi.mocked(service.recordTrackingUpdate).mockResolvedValue(undefined as any);

    const req = {
      params: { id: 's-1' },
      body: { status: 'in_transit', location: 'Hub A', source: 'manual' },
      user: { orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.addTrackingUpdateHandler(req, res, next);

    expect(service.recordTrackingUpdate).toHaveBeenCalledWith('s-1', 'in_transit', 'Hub A', 'manual');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
    expect(next).not.toHaveBeenCalled();
  });
});
