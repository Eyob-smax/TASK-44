import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission, requireRole, enforceSameOrg } from '../src/common/middleware/auth.middleware.js';

const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-auth-middleware-unit';

function makeReq(partial: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    ...partial,
  } as Request;
}

describe('auth.middleware', () => {
  it('authenticate sets req.user for valid bearer token', () => {
    const token = jwt.sign(
      {
        userId: 'u1',
        username: 'alice',
        roles: ['Administrator'],
        permissions: ['read:memberships:*'],
      },
      jwtSecret,
    );

    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn() as NextFunction;

    authenticate(req, {} as Response, next);

    expect(req.user?.userId).toBe('u1');
    expect(req.user?.roles).toContain('Administrator');
    expect(next).toHaveBeenCalledOnce();
    expect(vi.mocked(next).mock.calls[0]?.[0]).toBeUndefined();
  });

  it('authenticate rejects missing token', () => {
    const req = makeReq();
    const next = vi.fn() as NextFunction;

    authenticate(req, {} as Response, next);

    const err = vi.mocked(next).mock.calls[0]?.[0] as { message?: string; code?: string };
    expect(err?.message).toBe('Authentication required');
  });

  it('requirePermission allows matching permission and blocks non-matching one', () => {
    const allowReq = makeReq({ user: { userId: 'u1', username: 'a', roles: [], permissions: ['write:logistics:*'] } as any });
    const denyReq = makeReq({ user: { userId: 'u1', username: 'a', roles: [], permissions: ['read:logistics:*'] } as any });
    const middleware = requirePermission('write', 'logistics');

    const allowNext = vi.fn() as NextFunction;
    middleware(allowReq, {} as Response, allowNext);
    expect(vi.mocked(allowNext).mock.calls[0]?.[0]).toBeUndefined();

    const denyNext = vi.fn() as NextFunction;
    middleware(denyReq, {} as Response, denyNext);
    const err = vi.mocked(denyNext).mock.calls[0]?.[0] as { code?: string };
    expect(err?.code).toBe('FORBIDDEN');
  });

  it('requireRole allows expected role and rejects other roles', () => {
    const middleware = requireRole('Administrator');

    const allowReq = makeReq({ user: { userId: 'u1', username: 'a', roles: ['Administrator'], permissions: [] } as any });
    const allowNext = vi.fn() as NextFunction;
    middleware(allowReq, {} as Response, allowNext);
    expect(vi.mocked(allowNext).mock.calls[0]?.[0]).toBeUndefined();

    const denyReq = makeReq({ user: { userId: 'u1', username: 'a', roles: ['OpsManager'], permissions: [] } as any });
    const denyNext = vi.fn() as NextFunction;
    middleware(denyReq, {} as Response, denyNext);
    const err = vi.mocked(denyNext).mock.calls[0]?.[0] as { code?: string };
    expect(err?.code).toBe('FORBIDDEN');
  });

  it('enforceSameOrg allows same org and rejects cross-org with not found', () => {
    const middlewareReqAllow = makeReq({
      user: { userId: 'u1', username: 'a', roles: ['OpsManager'], permissions: [], orgId: 'org-1' } as any,
      params: { orgId: 'org-1' },
    });
    const nextAllow = vi.fn() as NextFunction;
    enforceSameOrg(middlewareReqAllow, {} as Response, nextAllow);
    expect(vi.mocked(nextAllow).mock.calls[0]?.[0]).toBeUndefined();

    const middlewareReqDeny = makeReq({
      user: { userId: 'u1', username: 'a', roles: ['OpsManager'], permissions: [], orgId: 'org-1' } as any,
      params: { orgId: 'org-2' },
    });
    const nextDeny = vi.fn() as NextFunction;
    enforceSameOrg(middlewareReqDeny, {} as Response, nextDeny);
    const err = vi.mocked(nextDeny).mock.calls[0]?.[0] as { code?: string };
    expect(err?.code).toBe('NOT_FOUND');
  });
});
