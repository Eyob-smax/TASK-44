import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/parking/repository.js', () => ({
  findExceptions: vi.fn(),
  findExceptionById: vi.fn(),
  escalateException: vi.fn(),
  resolveException: vi.fn(),
}));

vi.mock('../src/modules/parking/service.js', () => ({
  ingestParkingEvent: vi.fn(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const ctrl = await import('../src/modules/parking/controller.js');
const repo = await import('../src/modules/parking/repository.js');
const { db } = await import('../src/app/container.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe('parking controller unit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listExceptionsHandler forwards filters, pagination, and org scope', async () => {
    vi.mocked(repo.findExceptions).mockResolvedValue({ exceptions: [], total: 0 } as any);
    const req = {
      query: { page: '3', limit: '10', type: 'overtime' },
      user: { orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.listExceptionsHandler(req, res, next);

    expect(repo.findExceptions).toHaveBeenCalledWith({ facilityId: undefined, type: 'overtime', status: undefined }, { page: 3, limit: 10 }, 'org-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { exceptions: [], total: 0 } });
  });

  it('escalateExceptionHandler rejects non-supervisor escalation target', async () => {
    vi.mocked(repo.findExceptionById).mockResolvedValue({
      id: 'exc-1',
      facility: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'u2',
      isActive: true,
      orgId: 'org-1',
      userRoles: [{ role: { name: 'Viewer' } }],
    } as any);

    const req = {
      params: { id: 'exc-1' },
      body: { escalatedToUserId: 'u2' },
      user: { userId: 'u1', orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.escalateExceptionHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toContain('supervisor privileges');
  });

  it('resolveExceptionHandler resolves scoped exception', async () => {
    vi.mocked(repo.findExceptionById).mockResolvedValue({
      id: 'exc-1',
      facility: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(repo.resolveException).mockResolvedValue({ id: 'exc-1', status: 'resolved' } as any);

    const req = {
      params: { id: 'exc-1' },
      body: { resolutionNote: 'done' },
      user: { orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.resolveExceptionHandler(req, res, next);

    expect(repo.resolveException).toHaveBeenCalledWith('exc-1', 'done');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'exc-1', status: 'resolved' } });
    expect(next).not.toHaveBeenCalled();
  });
});
