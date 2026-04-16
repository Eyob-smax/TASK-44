import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import { requestId } from '../src/common/middleware/request-id.js';
import { requestAccessLog } from '../src/common/middleware/request-logging.js';
import { logger } from '../src/common/logging/logger.js';

describe('request middleware units', () => {
  it('requestId assigns requestId and sets X-Request-Id header', () => {
    const req = {} as Request;
    const setHeader = vi.fn();
    const res = { setHeader } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestId(req, res, next);

    expect(typeof req.requestId).toBe('string');
    expect(req.requestId?.length).toBeGreaterThan(0);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalledOnce();
  });

  it('requestAccessLog logs completion details on finish event', () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger as any);
    const req = {
      requestId: 'rid-1',
      method: 'GET',
      originalUrl: '/health',
      user: { userId: 'u1', orgId: 'org-1' },
    } as unknown as Request;

    const emitter = new EventEmitter();
    const res = Object.assign(emitter, { statusCode: 204 }) as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestAccessLog(req, res, next);
    emitter.emit('finish');

    const call = infoSpy.mock.calls.find((c) => c[0] === 'HTTP request completed');
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({
      requestId: 'rid-1',
      method: 'GET',
      path: '/health',
      statusCode: 204,
      userId: 'u1',
      orgId: 'org-1',
    });

    infoSpy.mockRestore();
  });
});
