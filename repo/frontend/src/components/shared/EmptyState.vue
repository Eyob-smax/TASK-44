<template>
  <div class="empty-state" data-testid="empty-state">
    <div class="empty-icon" aria-hidden="true">◻</div>
    <p class="empty-label">{{ label }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
  color: #9ca3af;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
  opacity: 0.4;
}

.empty-label {
  font-size: 0.9rem;
  margin: 0;
}
</style>
