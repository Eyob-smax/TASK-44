import { Request, Response, NextFunction } from 'express';
import { db } from '../../app/container.js';
import { ValidationError, ConflictError } from '../errors/app-errors.js';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const IN_FLIGHT_SENTINEL = ''; // empty string signals in-flight (no response yet)

export function buildIdempotencyScope(req: Request): string {
  if (req.user) {
    return `user:${req.user.userId}:org:${req.user.orgId ?? 'platform'}`;
  }
  return `anonymous:${req.ip ?? 'unknown'}`;
}

export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-idempotency-key'];

  if (!key || typeof key !== 'string') {
    next();
    return;
  }

  if (key.length > 64) {
    next(new ValidationError('X-Idempotency-Key must be 64 characters or fewer'));
    return;
  }

  req.idempotencyKey = key;
  const scope = buildIdempotencyScope(req);

  db.idempotencyRecord
    .findFirst({ where: { scope, key } })
    .then((record) => {
      const now = new Date();

      if (record) {
        // Expired — delete and treat as new
        if (record.expiresAt < now) {
          return db.idempotencyRecord
            .delete({ where: { id: record.id } })
            .then(() => insertPendingAndContinue(scope, key, req, res, next));
        }

        // In-flight: responseBody is empty string sentinel
        if (record.responseBody === IN_FLIGHT_SENTINEL) {
          next(new ConflictError('Request in progress'));
          return;
        }

        // Replay: response body is populated — verify method/path match to prevent key reuse attacks
        if (record.method !== req.method || record.path !== req.path) {
          next(new ConflictError('Idempotency key already used for a different request'));
          return;
        }
        res.status(record.statusCode).json(JSON.parse(record.responseBody));
        return;
      }

      return insertPendingAndContinue(scope, key, req, res, next);
    })
    .catch((err) => next(err));
}

function insertPendingAndContinue(
  scope: string,
  key: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

  return db.idempotencyRecord
    .create({
      data: {
        scope,
        key,
        method: req.method,
        path: req.path,
        statusCode: 0,
        responseBody: IN_FLIGHT_SENTINEL,
        expiresAt,
      },
    })
    .then((created) => {
      const originalJson = res.json.bind(res);

      res.json = function (body: unknown): Response {
        const statusCode = res.statusCode;
        const responseBody = JSON.stringify(body);

        db.idempotencyRecord
          .update({
            where: { id: created.id },
            data: { statusCode, responseBody },
          })
          .catch(() => {
            // Best-effort persistence — do not fail the response
          });

        return originalJson(body);
      };

      next();
    });
}
