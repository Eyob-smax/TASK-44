import { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export function getConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const result = service.getConfig();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const result = service.updateConfig(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
