import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/classroom-ops/service.js', () => ({
  assignAnomaly: vi.fn(),
  getClassroomDashboard: vi.fn(),
}));

vi.mock('../src/modules/classroom-ops/repository.js', () => ({
  findAnomalyById: vi.fn(),
  findCampusById: vi.fn(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const ctrl = await import('../src/modules/classroom-ops/controller.js');
const service = await import('../src/modules/classroom-ops/service.js');
const repo = await import('../src/modules/classroom-ops/repository.js');
const { db } = await import('../src/app/container.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('classroom-ops controller unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDashboardHandler rejects missing campusId query param', async () => {
    const req = {
      query: {},
      user: { orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.getDashboardHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toBe('campusId query parameter is required');
  });

  it('assignAnomalyHandler rejects assignee without classroom-ops eligible role', async () => {
    vi.mocked(repo.findAnomalyById).mockResolvedValue({
      id: 'anom-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);

    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'user-2',
      isActive: true,
      orgId: 'org-1',
      userRoles: [{ role: { name: 'Viewer' } }],
    } as any);

    const req = {
      params: { id: 'anom-1' },
      body: { assignedToUserId: 'user-2' },
      user: { userId: 'user-1', orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.assignAnomalyHandler(req, res, next);

    expect(service.assignAnomaly).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toBe('Assignee must have a classroom-ops eligible role');
  });

  it('assignAnomalyHandler returns success when assignee has eligible role', async () => {
    vi.mocked(repo.findAnomalyById).mockResolvedValue({
      id: 'anom-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);

    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'user-2',
      isActive: true,
      orgId: 'org-1',
      userRoles: [{ role: { name: 'ClassroomSupervisor' } }],
    } as any);

    vi.mocked(service.assignAnomaly).mockResolvedValue({
      id: 'assign-1',
      anomalyEventId: 'anom-1',
      assignedToUserId: 'user-2',
      assignedByUserId: 'user-1',
    } as any);

    const req = {
      params: { id: 'anom-1' },
      body: { assignedToUserId: 'user-2' },
      user: { userId: 'user-1', orgId: 'org-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.assignAnomalyHandler(req, res, next);

    expect(service.assignAnomaly).toHaveBeenCalledWith('anom-1', 'user-2', 'user-1');
    expect((res.json as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      success: true,
      data: {
        id: 'assign-1',
        anomalyEventId: 'anom-1',
        assignedToUserId: 'user-2',
        assignedByUserId: 'user-1',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
