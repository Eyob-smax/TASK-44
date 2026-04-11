import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import { router } from './app/router.js';
import { registerTokenGetter } from './services/api-client.js';
import { useAuthStore } from './stores/auth.store.js';
import { authService } from './services/auth.service.js';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(PrimeVue, { ripple: false });

// Wire auth token into the API client after Pinia is initialized
registerTokenGetter(() => {
  const auth = useAuthStore();
  return auth.getToken();
});

// Hydrate session from persisted token before mounting so the route guard
// has populated state before the first navigation check
const auth = useAuthStore();
if (auth.getToken()) {
  try {
    const { user, permissions } = await authService.me();
    auth.hydrateFromToken(user, permissions);
  } catch {
    auth.clearSession(); // token expired or invalid — force re-login
  }
}

app.mount('#app');
