import { describe, it, expect } from 'vitest';
import { buildIdempotencyScope } from '../src/common/middleware/idempotency.js';

describe('buildIdempotencyScope', () => {
  it('builds a stable scope for the same authenticated user', () => {
    const req = {
      user: {
        userId: 'user-1',
        username: 'alice',
        roles: ['OpsManager'],
        permissions: ['write:logistics:*'],
        orgId: 'org-1',
      },
      ip: '127.0.0.1',
    } as any;

    const one = buildIdempotencyScope(req);
    const two = buildIdempotencyScope(req);

    expect(one).toBe(two);
    expect(one).toContain('user:user-1');
    expect(one).toContain('org:org-1');
  });

  it('builds different scopes for different users sharing same org', () => {
    const reqOne = {
      user: {
        userId: 'user-1',
        username: 'alice',
        roles: ['OpsManager'],
        permissions: ['write:logistics:*'],
        orgId: 'org-1',
      },
      ip: '127.0.0.1',
    } as any;

    const reqTwo = {
      user: {
        userId: 'user-2',
        username: 'bob',
        roles: ['OpsManager'],
        permissions: ['write:logistics:*'],
        orgId: 'org-1',
      },
      ip: '127.0.0.1',
    } as any;

    expect(buildIdempotencyScope(reqOne)).not.toBe(buildIdempotencyScope(reqTwo));
  });

  it('falls back to anonymous scope when request is unauthenticated', () => {
    const req = { ip: '10.0.0.2' } as any;
    const scope = buildIdempotencyScope(req);

    expect(scope).toBe('anonymous:10.0.0.2');
  });
});
