import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/configuration/service.js', () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

const ctrl = await import('../src/modules/configuration/controller.js');
const service = await import('../src/modules/configuration/service.js');

function makeRes() {
  const res = {
    json: vi.fn(),
  } as unknown as Response;
  return res;
}

describe('configuration controller unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getConfig returns success envelope', () => {
    vi.mocked(service.getConfig).mockReturnValue({
      config: { heartbeatFreshnessSeconds: 30 },
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as any);

    const req = {} as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    ctrl.getConfig(req, res, next);

    expect(service.getConfig).toHaveBeenCalledTimes(1);
    expect((res.json as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      success: true,
      data: {
        config: { heartbeatFreshnessSeconds: 30 },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('updateConfig returns updated config payload', async () => {
    vi.mocked(service.updateConfig).mockReturnValue({
      config: { heartbeatFreshnessSeconds: 120 },
      updatedAt: '2026-01-02T00:00:00.000Z',
    } as any);

    const req = { body: { heartbeatFreshnessSeconds: 120 } } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.updateConfig(req, res, next);

    expect(service.updateConfig).toHaveBeenCalledWith({ heartbeatFreshnessSeconds: 120 });
    expect((res.json as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      success: true,
      data: {
        config: { heartbeatFreshnessSeconds: 120 },
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
