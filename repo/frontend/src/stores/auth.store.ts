import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuthSessionResponse, UserResponse } from '../services/types.js';

const TOKEN_KEY = 'campusops_token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const user = ref<UserResponse | null>(null);
  const permissions = ref<string[]>([]);

  const isAuthenticated = computed(() => token.value !== null && user.value !== null);

  function setSession(session: AuthSessionResponse) {
    token.value = session.token;
    user.value = session.user;
    permissions.value = session.permissions;
    localStorage.setItem(TOKEN_KEY, session.token);
  }

  function clearSession() {
    token.value = null;
    user.value = null;
    permissions.value = [];
    localStorage.removeItem(TOKEN_KEY);
  }

  function hasPermission(permission: string): boolean {
    return permissions.value.includes(permission);
  }

  function hasAnyRole(...roles: string[]): boolean {
    const userRoles = user.value?.roles.map((r) => r.name) ?? [];
    return roles.some((r) => userRoles.includes(r));
  }

  function getToken(): string | null {
    return token.value;
  }

  // Called on startup to restore user profile from a persisted token without
  // issuing a new token (token stays from localStorage, user/permissions come
  // from the /auth/me response).
  function hydrateFromToken(userProfile: UserResponse, perms: string[]): void {
    user.value = userProfile;
    permissions.value = perms;
  }

  return {
    token,
    user,
    permissions,
    isAuthenticated,
    setSession,
    clearSession,
    hasPermission,
    hasAnyRole,
    getToken,
    hydrateFromToken,
  };
});
