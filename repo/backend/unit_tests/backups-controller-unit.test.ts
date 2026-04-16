import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../src/modules/backups/service.js', () => ({
  triggerBackup: vi.fn(),
  listBackups: vi.fn(),
  getBackupById: vi.fn(),
  triggerRestore: vi.fn(),
  listRestoreRuns: vi.fn(),
}));

const ctrl = await import('../src/modules/backups/controller.js');
const service = await import('../src/modules/backups/service.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('backups controller unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggerBackup defaults backup type to full', async () => {
    vi.mocked(service.triggerBackup).mockResolvedValue({ backupId: 'b-1' } as any);

    const req = { body: {} } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.triggerBackup(req, res, next);

    expect(service.triggerBackup).toHaveBeenCalledWith('full');
    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(202);
    expect(next).not.toHaveBeenCalled();
  });

  it('getBackup returns 404 envelope when backup is missing', async () => {
    vi.mocked(service.getBackupById).mockResolvedValue(null);

    const req = { params: { id: 'missing' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.getBackup(req, res, next);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(404);
    expect((res.json as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Backup missing not found' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('triggerRestore forwards backup id and authenticated user id', async () => {
    vi.mocked(service.triggerRestore).mockResolvedValue({ restoreRunId: 'rr-1' } as any);

    const req = {
      params: { id: 'backup-1' },
      user: { userId: 'user-1' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await ctrl.triggerRestore(req, res, next);

    expect(service.triggerRestore).toHaveBeenCalledWith('backup-1', 'user-1');
    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(202);
    expect(next).not.toHaveBeenCalled();
  });
});
