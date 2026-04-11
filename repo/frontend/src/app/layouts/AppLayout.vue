<template>
  <div class="app-layout">
    <aside class="sidebar" role="navigation" aria-label="Main navigation">
      <div class="sidebar-brand">
        <span class="brand-name">CampusOps</span>
      </div>

      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="nav-item--active"
        >
          <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <div class="user-info" data-testid="user-info">
          <span class="user-display">{{ auth.user?.displayName }}</span>
          <span class="user-role">{{ primaryRole }}</span>
        </div>
        <button class="logout-btn" @click="handleLogout">Sign out</button>
      </div>
    </aside>

    <main class="main-content">
      <RouterView />
    </main>

    <!-- Notification toasts -->
    <div class="toast-stack" aria-live="polite">
      <div
        v-for="n in ui.notifications"
        :key="n.id"
        :class="['toast', `toast--${n.severity}`]"
        role="alert"
      >
        <strong>{{ n.summary }}</strong>
        <span v-if="n.detail">{{ n.detail }}</span>
        <button class="toast-close" @click="ui.removeNotification(n.id)" aria-label="Dismiss">×</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { authService } from '../../services/auth.service.js';

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Permission required to see this nav item — undefined means any authenticated user */
  requiredPermission?: string;
  /** Roles that can see this nav item — overrides permission check */
  requiredRoles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
  {
    to: '/classroom-ops',
    label: 'Classroom Ops',
    icon: '⬜',
    requiredPermission: 'read:classroom-ops:*',
  },
  {
    to: '/parking',
    label: 'Parking',
    icon: '🅿',
    requiredPermission: 'read:parking:*',
  },
  {
    to: '/fulfillment',
    label: 'Fulfillment',
    icon: '📦',
    requiredPermission: 'read:logistics:*',
  },
  {
    to: '/after-sales',
    label: 'After-Sales',
    icon: '🎫',
    requiredPermission: 'read:after-sales:*',
  },
  {
    to: '/memberships',
    label: 'Memberships',
    icon: '👤',
    requiredPermission: 'read:memberships:*',
  },
  {
    to: '/admin',
    label: 'Admin / Data',
    icon: '⚙',
    requiredRoles: ['Administrator', 'OpsManager', 'Auditor'],
  },
  {
    to: '/observability',
    label: 'Observability',
    icon: '📊',
    requiredPermission: 'read:observability:*',
  },
];

const visibleNavItems = computed(() =>
  NAV_ITEMS.filter((item) => {
    if (item.requiredRoles && item.requiredRoles.length > 0) {
      return auth.hasAnyRole(...item.requiredRoles);
    }
    if (item.requiredPermission) {
      return auth.hasPermission(item.requiredPermission);
    }
    return true;
  }),
);

const primaryRole = computed(() => auth.user?.roles[0]?.name ?? '');

async function handleLogout() {
  try {
    await authService.logout();
  } catch {
    // ignore logout errors — always clear session
  }
  auth.clearSession();
  router.push({ name: 'login' });
}
</script>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  background: #f4f6f9;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #1a1a2e;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
}

.sidebar-brand {
  padding: 1.25rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.brand-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.sidebar-nav {
  flex: 1;
  padding: 0.75rem 0;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1rem;
  text-decoration: none;
  color: #c0c0d0;
  font-size: 0.9rem;
  transition: background 0.15s;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
}

.nav-item--active {
  background: rgba(100, 149, 237, 0.25);
  color: #a0c4ff;
}

.nav-icon {
  width: 1.25rem;
  text-align: center;
  font-style: normal;
}

.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.8rem;
}

.user-info {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.6rem;
}

.user-display {
  font-weight: 600;
  color: #e0e0e0;
}

.user-role {
  color: #8a8a9a;
  font-size: 0.75rem;
}

.logout-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #c0c0d0;
  border-radius: 4px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  font-size: 0.8rem;
  width: 100%;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.07);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.toast-stack {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 1000;
  max-width: 360px;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-size: 0.875rem;
}

.toast--success { border-left: 4px solid #22c55e; }
.toast--error   { border-left: 4px solid #ef4444; }
.toast--warn    { border-left: 4px solid #f59e0b; }
.toast--info    { border-left: 4px solid #3b82f6; }

.toast-close {
  margin-left: auto;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: #9ca3af;
  line-height: 1;
}
</style>
