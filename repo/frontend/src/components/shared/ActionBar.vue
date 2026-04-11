<template>
  <div class="action-bar" data-testid="action-bar">
    <div class="action-bar-left">
      <slot name="left" />
    </div>
    <div class="action-bar-right">
      <template v-for="action in visibleActions" :key="action.label">
        <button
          :class="['action-btn', `action-btn--${action.variant ?? 'default'}`]"
          :disabled="action.disabled || submitting"
          @click="action.onClick"
          :data-testid="`action-${action.label.toLowerCase().replace(/\s+/g, '-')}`"
        >
          <span v-if="action.icon" class="action-icon" aria-hidden="true">{{ action.icon }}</span>
          {{ action.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth.store.js';

export interface ActionBarAction {
  label: string;
  onClick: () => void;
  icon?: string;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  /** Permission required to show action — omit to always show */
  requiredPermission?: string;
  /** Roles that can see this action — overrides permission check */
  requiredRoles?: string[];
}

const props = defineProps<{
  actions: ActionBarAction[];
  submitting?: boolean;
}>();

const auth = useAuthStore();

const visibleActions = computed(() =>
  props.actions.filter((action) => {
    if (action.requiredRoles && action.requiredRoles.length > 0) {
      return auth.hasAnyRole(...action.requiredRoles);
    }
    if (action.requiredPermission) {
      return auth.hasPermission(action.requiredPermission);
    }
    return true;
  }),
);
</script>

<style scoped>
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.action-bar-left,
.action-bar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  border-radius: 4px;
  padding: 0.45rem 0.9rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn--primary {
  background: #1a1a2e;
  color: #fff;
  border-color: #1a1a2e;
}

.action-btn--primary:hover:not(:disabled) {
  background: #2d2d4e;
  border-color: #2d2d4e;
}

.action-btn--danger {
  background: #fee2e2;
  color: #b91c1c;
  border-color: #fca5a5;
}

.action-btn--danger:hover:not(:disabled) {
  background: #fecaca;
}

.action-icon {
  font-style: normal;
}
</style>
