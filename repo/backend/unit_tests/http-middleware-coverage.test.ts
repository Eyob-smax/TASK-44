import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestId } from '../src/common/middleware/request-id.js';
import { requestAccessLog } from '../src/common/middleware/request-logging.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { globalRateLimiter } from '../src/common/middleware/rate-limiter.js';
import { ValidationError } from '../src/common/errors/app-errors.js';
import { logger } from '../src/common/logging/logger.js';

function buildBaseApp() {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use(requestAccessLog);
  return app;
}

describe('HTTP middleware coverage (request id, access log, rate limit, error handler)', () => {
  it('requestId sets requestId on request and X-Request-Id response header', async () => {
    const app = buildBaseApp();

    app.get('/ok', (req, res) => {
      res.json({ success: true, requestId: req.requestId });
    });

    const res = await request(app).get('/ok');
    expect(res.status).toBe(200);
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('requestAccessLog emits completion log with method/path/status', async () => {
    const app = buildBaseApp();
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger as any);

    app.get('/log-test', (_req, res) => {
      res.status(204).send();
    });

    const res = await request(app).get('/log-test');
    expect(res.status).toBe(204);

    const call = infoSpy.mock.calls.find((c) => c[0] === 'HTTP request completed');
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ method: 'GET', path: '/log-test', statusCode: 204 });

    infoSpy.mockRestore();
  });

  it('errorHandler returns structured envelope for AppError and sets request id header', async () => {
    const app = buildBaseApp();

    app.get('/validation-error', () => {
      throw new ValidationError('Invalid payload', { field: ['Required'] });
    });

    app.use(errorHandler);

    const res = await request(app).get('/validation-error');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('globalRateLimiter returns RATE_LIMITED envelope when exceeded', async () => {
    const app = express();
    app.use(globalRateLimiter);
    app.get('/rl', (_req, res) => {
      res.status(200).json({ success: true });
    });

    const attempts = 140;
    let gotRateLimited = false;
    for (let i = 0; i < attempts; i += 1) {
      const res = await request(app).get('/rl');
      if (res.status === 429) {
        gotRateLimited = true;
        expect(res.body.success).toBe(false);
        expect(res.body.error?.code).toBe('RATE_LIMITED');
        break;
      }
    }

    expect(gotRateLimited).toBe(true);
  });
});
