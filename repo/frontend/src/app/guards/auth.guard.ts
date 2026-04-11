import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';

/**
 * Global navigation guard enforcing authentication and permission checks.
 *
 * Route meta fields:
 *   requiresAuth: boolean         — redirect to /login if not authenticated
 *   requiredPermission: string    — redirect to /forbidden if permission missing
 *   requiredRoles: string[]       — redirect to /forbidden if no matching role
 */
export function authGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext,
): void {
  const auth = useAuthStore();

  // Authenticated user should not re-visit login
  if (to.name === 'login' && auth.isAuthenticated) {
    next({ name: 'dashboard' });
    return;
  }

  // Route requires authentication
  if (to.meta.requiresAuth) {
    if (!auth.isAuthenticated) {
      next({ name: 'login', query: { redirect: to.fullPath } });
      return;
    }

    // Route requires a specific permission
    const requiredPermission = to.meta.requiredPermission as string | undefined;
    if (requiredPermission && !auth.hasPermission(requiredPermission)) {
      next({ name: 'forbidden' });
      return;
    }

    // Route requires one of specific roles
    const requiredRoles = to.meta.requiredRoles as string[] | undefined;
    if (requiredRoles && requiredRoles.length > 0 && !auth.hasAnyRole(...requiredRoles)) {
      next({ name: 'forbidden' });
      return;
    }
  }

  next();
}
