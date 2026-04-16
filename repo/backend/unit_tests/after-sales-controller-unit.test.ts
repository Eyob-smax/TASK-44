import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/after-sales/service.js', () => ({
  createTicket: vi.fn(),
}));

vi.mock('../src/modules/after-sales/repository.js', () => ({
  findTicketById: vi.fn(),
  assignTicket: vi.fn(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const ctrl = await import('../src/modules/after-sales/controller.js');
const service = await import('../src/modules/after-sales/service.js');
const repo = await import('../src/modules/after-sales/repository.js');
const { db } = await import('../src/app/container.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe('after-sales controller unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createTicketHandler returns 201 and delegates to service', async () => {
    vi.mocked(service.createTicket).mockResolvedValue({ id: 't-1' } as any);
    const req = {
      params: { orgId: 'org-1' },
      user: { userId: 'u-1' },
      body: { type: 'delay' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.createTicketHandler(req, res, next);

    expect(service.createTicket).toHaveBeenCalledWith('org-1', 'u-1', { type: 'delay' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 't-1' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('assignTicketHandler rejects assignee without eligible role', async () => {
    vi.mocked(repo.findTicketById).mockResolvedValue({ id: 't-1', orgId: 'org-1' } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'assignee-1',
      isActive: true,
      orgId: 'org-1',
      userRoles: [{ role: { name: 'Viewer' } }],
    } as any);

    const req = {
      params: { id: 't-1' },
      body: { assignedToUserId: 'assignee-1' },
      user: { userId: 'u-1', orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.assignTicketHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toContain('after-sales eligible role');
  });
});
