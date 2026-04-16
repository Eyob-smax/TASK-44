import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/master-data/repository.js', () => ({
  listOrgs: vi.fn(),
  createStudent: vi.fn(),
}));

vi.mock('../src/modules/master-data/service.js', () => ({
  getStudentById: vi.fn(),
}));

vi.mock('../src/jobs/job-monitor.js', () => ({
  enqueueJob: vi.fn(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    fileAsset: {
      create: vi.fn(),
    },
  },
}));

const ctrl = await import('../src/modules/master-data/controller.js');
const repo = await import('../src/modules/master-data/repository.js');
const service = await import('../src/modules/master-data/service.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('master-data controller unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listOrgsHandler passes undefined orgId for Administrator and returns data', async () => {
    vi.mocked(repo.listOrgs).mockResolvedValue([{ id: 'org-1' }] as any);

    const req = {
      user: {
        roles: ['Administrator'],
        orgId: 'org-admin',
      },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.listOrgsHandler(req, res, next);

    expect(repo.listOrgs).toHaveBeenCalledWith(undefined);
    expect((res.json as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      success: true,
      data: [{ id: 'org-1' }],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('getStudentHandler returns NotFound when student org does not match route org', async () => {
    vi.mocked(service.getStudentById).mockResolvedValue({
      id: 'stu-1',
      orgId: 'org-other',
    } as any);

    const req = {
      params: { id: 'stu-1', orgId: 'org-expected' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.getStudentHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toBe('Student not found');
  });

  it('createStudentHandler returns 201 with created student payload', async () => {
    vi.mocked(repo.createStudent).mockResolvedValue({
      id: 'stu-new',
      orgId: 'org-1',
      fullName: 'Student One',
    } as any);

    const req = {
      params: { orgId: 'org-1' },
      body: { fullName: 'Student One' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.createStudentHandler(req, res, next);

    expect(repo.createStudent).toHaveBeenCalledWith('org-1', { fullName: 'Student One' });
    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(201);
    expect((res.json as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      success: true,
      data: {
        id: 'stu-new',
        orgId: 'org-1',
        fullName: 'Student One',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
