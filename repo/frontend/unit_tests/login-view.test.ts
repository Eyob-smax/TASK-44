import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import LoginView from '../src/app/views/LoginView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';
import { ApiError } from '../src/services/types.js';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  routeQuery: {} as Record<string, unknown>,
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMocks.push }),
  useRoute: () => ({ query: routerMocks.routeQuery }),
}));

vi.mock('../src/services/auth.service.js', () => ({
  authService: {
    login: vi.fn(),
  },
}));

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(LoginView, {
    global: { plugins: [pinia] },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  routerMocks.push.mockReset();
  routerMocks.routeQuery = {};
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LoginView', () => {
  it('submits credentials, stores session, and redirects to dashboard by default', async () => {
    const { authService } = await import('../src/services/auth.service.js');
    vi.mocked(authService.login).mockResolvedValue({
      token: 'jwt-token',
      permissions: ['read:classroom-ops:*'],
      user: {
        id: 'user-1',
        username: 'demo.admin',
        displayName: 'Admin',
        orgId: 'org-1',
        isActive: true,
        lastLoginAt: null,
        roles: [{ id: 'role-1', name: 'Administrator' }],
        createdAt: new Date().toISOString(),
      },
    } as any);

    const wrapper = await mountView();
    await wrapper.find('[data-testid="username-input"]').setValue('demo.admin');
    await wrapper.find('[data-testid="password-input"]').setValue('password');
    await wrapper.find('[data-testid="login-form"]').trigger('submit');
    await flushPromises();

    const auth = useAuthStore();
    expect(vi.mocked(authService.login)).toHaveBeenCalledWith('demo.admin', 'password');
    expect(auth.token).toBe('jwt-token');
    expect(routerMocks.push).toHaveBeenCalledWith('/dashboard');
  });

  it('honors redirect query parameter after successful login', async () => {
    const { authService } = await import('../src/services/auth.service.js');
    routerMocks.routeQuery = { redirect: '/parking' };
    vi.mocked(authService.login).mockResolvedValue({
      token: 'jwt-token',
      permissions: [],
      user: {
        id: 'user-1',
        username: 'demo.ops',
        displayName: 'Ops',
        orgId: 'org-1',
        isActive: true,
        lastLoginAt: null,
        roles: [{ id: 'role-1', name: 'OpsManager' }],
        createdAt: new Date().toISOString(),
      },
    } as any);

    const wrapper = await mountView();
    await wrapper.find('[data-testid="username-input"]').setValue('demo.ops');
    await wrapper.find('[data-testid="password-input"]').setValue('password');
    await wrapper.find('[data-testid="login-form"]').trigger('submit');
    await flushPromises();

    expect(routerMocks.push).toHaveBeenCalledWith('/parking');
  });

  it('shows user-friendly message on UNAUTHORIZED error', async () => {
    const { authService } = await import('../src/services/auth.service.js');
    vi.mocked(authService.login).mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'Invalid credentials'),
    );

    const wrapper = await mountView();
    await wrapper.find('[data-testid="username-input"]').setValue('bad.user');
    await wrapper.find('[data-testid="password-input"]').setValue('wrong');
    await wrapper.find('[data-testid="login-form"]').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="login-error"]').text()).toContain('Invalid username or password.');
  });
});
