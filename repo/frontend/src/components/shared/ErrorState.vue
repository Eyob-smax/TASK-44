<template>
  <div class="error-state" role="alert" data-testid="error-state">
    <div class="error-icon" aria-hidden="true">⚠</div>
    <p class="error-message">{{ message }}</p>
    <button v-if="onRetry" class="retry-btn" @click="onRetry">Retry</button>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
  onRetry?: () => void;
}>();
</script>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1rem;
  text-align: center;
}

.error-icon {
  font-size: 2rem;
  color: #ef4444;
  margin-bottom: 0.6rem;
}

.error-message {
  font-size: 0.9rem;
  color: #374151;
  margin: 0 0 1rem;
}

.retry-btn {
  background: #1a1a2e;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.45rem 1rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.retry-btn:hover {
  background: #2d2d4e;
}
</style>
