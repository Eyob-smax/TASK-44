import { Request, Response, NextFunction } from 'express';
import { verifySignature } from '../signing/api-signer.js';
import { UnauthorizedError } from '../errors/app-errors.js';
import { config } from '../../app/config.js';

/**
 * Verifies HMAC-SHA256 signatures for internal signed integration endpoints.
 * Agents must include:
 *   X-Signature: <hex-signature>
 *   X-Timestamp: <unix-ms>
 */
export function verifySigning(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-signature'] as string | undefined;
  const timestampHeader = req.headers['x-timestamp'] as string | undefined;

  if (!signature || !timestampHeader) {
    next(new UnauthorizedError('Missing signing headers (X-Signature, X-Timestamp)'));
    return;
  }

  const timestampMs = Number(timestampHeader);
  if (isNaN(timestampMs)) {
    next(new UnauthorizedError('Invalid X-Timestamp header'));
    return;
  }

  const payload = JSON.stringify(req.body ?? {});
  const valid = verifySignature(payload, config.INTEGRATION_SIGNING_SECRET, signature, timestampMs);

  if (!valid) {
    next(new UnauthorizedError('Invalid or expired request signature'));
    return;
  }

  next();
}
