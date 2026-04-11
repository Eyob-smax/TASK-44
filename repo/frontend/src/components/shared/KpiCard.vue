<template>
  <div class="kpi-card" :class="{ 'kpi-card--alert': alert }" data-testid="kpi-card">
    <div class="kpi-label">{{ label }}</div>
    <div class="kpi-value" data-testid="kpi-value">{{ value }}</div>
    <div v-if="sub" class="kpi-sub">{{ sub }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  sub?: string;
  /** Highlights card in warning colour when true */
  alert?: boolean;
}>();
</script>

<style scoped>
.kpi-card {
  background: #fff;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  border-left: 4px solid transparent;
  min-width: 140px;
}
.kpi-card--alert {
  border-left-color: #ef4444;
}
.kpi-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b7280;
  font-weight: 600;
  margin-bottom: 0.4rem;
}
.kpi-value {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  line-height: 1;
}
.kpi-sub {
  font-size: 0.8rem;
  color: #9ca3af;
  margin-top: 0.3rem;
}
</style>
