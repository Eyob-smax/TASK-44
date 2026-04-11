<template>
  <div class="loading-spinner" role="status" :aria-label="label ?? 'Loading'" data-testid="loading-spinner">
    <div class="spinner" aria-hidden="true" />
    <span v-if="label" class="spinner-label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string;
}>();
</script>

<style scoped>
.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1rem;
  gap: 0.75rem;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid #e5e7eb;
  border-top-color: #6495ed;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner-label {
  font-size: 0.875rem;
  color: #6b7280;
}
</style>
