import { Request, Response, NextFunction } from 'express';
import { AppError, InternalError } from '../errors/app-errors.js';
import type { ErrorEnvelope } from '../validation/schemas.js';
import { logger } from '../logging/logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';
  res.setHeader('X-Request-Id', requestId);

  if (err instanceof AppError) {
    const envelope: ErrorEnvelope = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      requestId,
    };
    res.status(err.httpStatus).json(envelope);
    return;
  }

  // Unknown error — log full stack internally, return safe generic response
  const wrapped = new InternalError();
  logger.error('Unhandled error', {
    requestId,
    orgId: req.user?.orgId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const envelope: ErrorEnvelope = {
    success: false,
    error: {
      code: wrapped.code,
      message: wrapped.message,
    },
    requestId,
  };
  res.status(wrapped.httpStatus).json(envelope);
}
