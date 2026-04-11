<template>
  <div class="login-wrapper">
    <div class="login-card">
      <h1 class="login-title">CampusOps</h1>
      <p class="login-subtitle">Fulfillment &amp; Operations Platform</p>

      <form class="login-form" @submit.prevent="handleSubmit" data-testid="login-form">
        <div class="field">
          <label for="username">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            autocomplete="username"
            required
            :disabled="submitting"
            data-testid="username-input"
          />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            :disabled="submitting"
            data-testid="password-input"
          />
        </div>

        <div v-if="errorMessage" class="error-banner" role="alert" data-testid="login-error">
          {{ errorMessage }}
        </div>

        <button type="submit" :disabled="submitting" class="submit-btn" data-testid="login-submit">
          {{ submitting ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';
import { authService } from '../../services/auth.service.js';
import { ApiError } from '../../services/types.js';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const username = ref('');
const password = ref('');
const submitting = ref(false);
const errorMessage = ref('');

async function handleSubmit() {
  if (submitting.value) return;
  errorMessage.value = '';
  submitting.value = true;
  try {
    const session = await authService.login(username.value, password.value);
    auth.setSession(session);
    const redirect = (route.query.redirect as string) ?? '/dashboard';
    router.push(redirect);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
      errorMessage.value = 'Invalid username or password.';
    } else {
      errorMessage.value = 'Sign-in failed. Please try again.';
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f6f9;
}

.login-card {
  background: #fff;
  border-radius: 8px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.login-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  color: #1a1a2e;
}

.login-subtitle {
  font-size: 0.9rem;
  color: #6c757d;
  margin: 0 0 2rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.field input {
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0.55rem 0.75rem;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}

.field input:focus {
  border-color: #6495ed;
  box-shadow: 0 0 0 2px rgba(100, 149, 237, 0.2);
}

.field input:disabled {
  background: #f9fafb;
  color: #9ca3af;
}

.error-banner {
  background: #fee2e2;
  color: #b91c1c;
  padding: 0.6rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.submit-btn {
  background: #1a1a2e;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.65rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.submit-btn:hover:not(:disabled) {
  background: #2d2d4e;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
