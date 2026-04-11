import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { authGuard } from '../src/app/guards/auth.guard.js';
import { useAuthStore } from '../src/stores/auth.store.js';
import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router';

function makeRoute(
  overrides: Partial<RouteLocationNormalized> = {},
): RouteLocationNormalized {
  return {
    name: 'dashboard',
    path: '/dashboard',
    fullPath: '/dashboard',
    params: {},
    query: {},
    hash: '',
    matched: [],
    meta: { requiresAuth: true },
    redirectedFrom: undefined,
    ...overrides,
  } as unknown as RouteLocationNormalized;
}

function makeNext(): NavigationGuardNext & { calls: unknown[] } {
  const calls: unknown[] = [];
  const next = vi.fn((arg?: unknown) => {
    calls.push(arg === undefined ? 'next()' : arg);
  }) as NavigationGuardNext & { calls: unknown[] };
  next.calls = calls;
  return next;
}

function setUser(roles: string[] = ['Administrator'], permissions: string[] = []) {
  const auth = useAuthStore();
  auth.setSession({
    token: 'test-token',
    permissions,
    user: {
      id: 'u1',
      username: 'admin',
      displayName: 'Admin User',
      orgId: 'org-1',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      roles: roles.map((name, i) => ({ id: `r${i}`, name })),
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  // Reset localStorage mock
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
});

describe('authGuard — unauthenticated', () => {
  it('redirects to login when route requires auth and user is not authenticated', () => {
    const to = makeRoute({ meta: { requiresAuth: true } });
    const from = makeRoute({ name: 'home', path: '/' } as any);
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/dashboard' } });
  });

  it('passes through public routes without auth', () => {
    const to = makeRoute({ name: 'login', path: '/login', meta: {} } as any);
    const from = makeRoute() as any;
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('authGuard — authenticated', () => {
  it('allows access to protected route when authenticated', () => {
    setUser(['OpsManager'], ['read:parking:*']);
    const to = makeRoute({ meta: { requiresAuth: true } });
    const from = makeRoute();
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('redirects authenticated user away from login to dashboard', () => {
    setUser();
    const to = makeRoute({ name: 'login', path: '/login', meta: {} } as any);
    const from = makeRoute();
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith({ name: 'dashboard' });
  });

  it('redirects to forbidden when required permission is missing', () => {
    setUser(['OpsManager'], []); // no read:classroom-ops:*
    const to = makeRoute({
      meta: { requiresAuth: true, requiredPermission: 'read:classroom-ops:*' },
    });
    const from = makeRoute();
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith({ name: 'forbidden' });
  });

  it('allows access when required permission is present', () => {
    setUser(['OpsManager'], ['read:classroom-ops:*']);
    const to = makeRoute({
      meta: { requiresAuth: true, requiredPermission: 'read:classroom-ops:*' },
    });
    const from = makeRoute();
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('redirects to forbidden when required role is missing', () => {
    setUser(['Auditor'], []); // Auditor does not match OpsManager/Administrator
    const to = makeRoute({
      meta: { requiresAuth: true, requiredRoles: ['OpsManager', 'Administrator'] },
    });
    const from = makeRoute();
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith({ name: 'forbidden' });
  });

  it('allows access when user has one of the required roles', () => {
    setUser(['OpsManager'], []);
    const to = makeRoute({
      meta: { requiresAuth: true, requiredRoles: ['OpsManager', 'Administrator'] },
    });
    const from = makeRoute();
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('allows Administrator access to admin route', () => {
    setUser(['Administrator'], []);
    const to = makeRoute({
      name: 'admin',
      path: '/admin',
      meta: { requiresAuth: true, requiredRoles: ['Administrator', 'OpsManager', 'Auditor'] },
    } as any);
    const from = makeRoute();
    const next = makeNext();

    authGuard(to, from, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('authGuard — backend permission vocabulary parity', () => {
  // These tests validate that the guard uses the same permission strings as the backend RBAC seed.
  // The seed uses write:memberships:* (not manage:memberships:*). If the frontend PERMISSIONS
  // constants drifted to use manage:, routes requiring write: would silently block valid users.

  it('allows access when token carries backend-seeded write:memberships:* permission', () => {
    setUser(['OpsManager'], ['write:memberships:*']);
    const to = makeRoute({
      meta: { requiresAuth: true, requiredPermission: 'write:memberships:*' },
    });
    const next = makeNext();

    authGuard(to, makeRoute(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('blocks access when token carries stale manage:memberships:* (not a seeded permission)', () => {
    setUser(['OpsManager'], ['manage:memberships:*']);
    const to = makeRoute({
      meta: { requiresAuth: true, requiredPermission: 'write:memberships:*' },
    });
    const next = makeNext();

    authGuard(to, makeRoute(), next);

    expect(next).toHaveBeenCalledWith({ name: 'forbidden' });
  });
});
