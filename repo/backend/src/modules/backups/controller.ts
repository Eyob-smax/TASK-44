import { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function triggerBackup(req: Request, res: Response, next: NextFunction) {
  try {
    const type = (req.body as { type?: string }).type ?? 'full';
    const result = await service.triggerBackup(type);
    res.status(202).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listBackups(req: Request, res: Response, next: NextFunction) {
  try {
    const backups = await service.listBackups();
    res.json({ success: true, data: { backups } });
  } catch (err) {
    next(err);
  }
}

export async function getBackup(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const backup = await service.getBackupById(id);
    if (!backup) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Backup ${id} not found` } });
      return;
    }
    res.json({ success: true, data: backup });
  } catch (err) {
    next(err);
  }
}

export async function triggerRestore(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: backupId } = req.params;
    const userId = req.user!.userId;
    const result = await service.triggerRestore(backupId, userId);
    res.status(202).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listRestoreRuns(req: Request, res: Response, next: NextFunction) {
  try {
    const runs = await service.listRestoreRuns();
    res.json({ success: true, data: { restoreRuns: runs } });
  } catch (err) {
    next(err);
  }
}
