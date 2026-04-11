<template>
  <div class="auth-layout">
    <div class="auth-card">
      <h1 class="auth-title">CampusOps</h1>
      <p class="auth-subtitle">Fulfillment &amp; Operations Platform</p>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.auth-layout {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f6f9;
}
.auth-card {
  background: #fff;
  border-radius: 8px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}
.auth-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  color: #1a1a2e;
}
.auth-subtitle {
  font-size: 0.9rem;
  color: #6c757d;
  margin: 0 0 2rem;
}
</style>
