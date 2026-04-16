import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/observability/service.js', () => ({
  getMetricsSummary: vi.fn(),
  searchLogs: vi.fn(),
  deleteAlertThreshold: vi.fn(),
}));

const ctrl = await import('../src/modules/observability/controller.js');
const service = await import('../src/modules/observability/service.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe('observability controller unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getMetricsSummary omits orgId for admin role', async () => {
    vi.mocked(service.getMetricsSummary).mockResolvedValue({ cpu: 10 } as any);
    const req = { user: { roles: ['Administrator'], orgId: 'org-1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.getMetricsSummary(req, res, next);

    expect(service.getMetricsSummary).toHaveBeenCalledWith(undefined);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { cpu: 10 } });
  });

  it('searchLogs caps limit at 200 and forwards org scope', async () => {
    vi.mocked(service.searchLogs).mockResolvedValue({ logs: [], total: 0 } as any);
    const req = {
      query: { limit: '999', page: '2', search: 'warn' },
      user: { orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.searchLogs(req, res, next);

    expect(service.searchLogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 200, page: 2, search: 'warn' }), 'org-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { logs: [], total: 0 } });
  });

  it('deleteAlertThreshold returns 204 and ends response', async () => {
    vi.mocked(service.deleteAlertThreshold).mockResolvedValue(undefined as any);
    const req = { params: { id: 'th-1' }, user: { orgId: 'org-1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.deleteAlertThreshold(req, res, next);

    expect(service.deleteAlertThreshold).toHaveBeenCalledWith('th-1', 'org-1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });
});
