import { Request, Response, NextFunction } from 'express';
import { logger } from '../logging/logger.js';

export function requestAccessLog(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('HTTP request completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.userId,
      orgId: req.user?.orgId,
    });
  });

  next();
}