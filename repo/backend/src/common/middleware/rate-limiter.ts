import rateLimit from 'express-rate-limit';
import { config } from '../../app/config.js';
import type { ErrorEnvelope } from '../validation/schemas.js';

function rateLimitHandler(
  _req: import('express').Request,
  res: import('express').Response,
): void {
  const envelope: ErrorEnvelope = {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests — please slow down and try again later',
    },
  };
  res.status(429).json(envelope);
}

export const globalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
