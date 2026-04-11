<template>
  <div class="error-page" data-testid="forbidden-page">
    <h2 class="code">403</h2>
    <p class="message">You don't have permission to access this page.</p>
    <RouterLink to="/dashboard" class="back-link">← Back to Dashboard</RouterLink>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
}
.code {
  font-size: 5rem;
  font-weight: 800;
  color: #ef4444;
  margin: 0;
}
.message {
  font-size: 1.1rem;
  color: #6b7280;
  margin: 0.5rem 0 1.5rem;
}
.back-link {
  color: #6495ed;
  text-decoration: none;
}
</style>
