import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useAuthStore } from '../src/stores/auth.store.js';
import AppLayout from '../src/app/layouts/AppLayout.vue';

// Stub RouterLink and RouterView to avoid full router dependency
const RouterLinkStub = { template: '<a><slot /></a>', props: ['to'] };
const RouterViewStub = { template: '<div />' };

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
});

function setUser(roles: string[], permissions: string[]) {
  const auth = useAuthStore();
  auth.setSession({
    token: 'tok',
    permissions,
    user: {
      id: 'u1',
      username: 'user',
      displayName: 'Test User',
      orgId: 'org-1',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      roles: roles.map((name, i) => ({ id: `r${i}`, name })),
    },
  });
}

function buildLayout() {
  return mount(AppLayout, {
    global: {
      plugins: [router],
      stubs: {
        RouterLink: RouterLinkStub,
        RouterView: RouterViewStub,
        Teleport: true,
      },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
});

describe('AppLayout nav visibility by role', () => {
  it('shows Dashboard nav item for all authenticated users', () => {
    setUser(['Auditor'], ['read:audit-logs:*']);
    const wrapper = buildLayout();
    expect(wrapper.text()).toContain('Dashboard');
  });

  it('shows Classroom Ops to user with read:classroom-ops:* permission', () => {
    setUser(['ClassroomSupervisor'], ['read:classroom-ops:*']);
    const wrapper = buildLayout();
    expect(wrapper.text()).toContain('Classroom Ops');
  });

  it('does not show Classroom Ops to user without classroom-ops permission', () => {
    setUser(['Auditor'], ['read:audit-logs:*']);
    const wrapper = buildLayout();
    expect(wrapper.text()).not.toContain('Classroom Ops');
  });

  it('shows Parking to user with read:parking:* permission', () => {
    setUser(['OpsManager'], ['read:parking:*']);
    const wrapper = buildLayout();
    expect(wrapper.text()).toContain('Parking');
  });

  it('does not show Parking without parking permission', () => {
    setUser(['ClassroomSupervisor'], ['read:classroom-ops:*']);
    const wrapper = buildLayout();
    expect(wrapper.text()).not.toContain('Parking');
  });

  it('shows Admin/Data to Administrator role', () => {
    setUser(['Administrator'], []);
    const wrapper = buildLayout();
    expect(wrapper.text()).toContain('Admin / Data');
  });

  it('shows Admin/Data to Auditor role', () => {
    setUser(['Auditor'], []);
    const wrapper = buildLayout();
    expect(wrapper.text()).toContain('Admin / Data');
  });

  it('does not show Admin/Data to ClassroomSupervisor', () => {
    setUser(['ClassroomSupervisor'], ['read:classroom-ops:*']);
    const wrapper = buildLayout();
    expect(wrapper.text()).not.toContain('Admin / Data');
  });

  it('shows all items to Administrator with full permissions', () => {
    setUser(
      ['Administrator'],
      [
        'read:classroom-ops:*',
        'read:parking:*',
        'read:logistics:*',
        'read:after-sales:*',
        'read:memberships:*',
        'read:observability:*',
      ],
    );
    const wrapper = buildLayout();
    expect(wrapper.text()).toContain('Classroom Ops');
    expect(wrapper.text()).toContain('Parking');
    expect(wrapper.text()).toContain('Fulfillment');
    expect(wrapper.text()).toContain('After-Sales');
    expect(wrapper.text()).toContain('Memberships');
    expect(wrapper.text()).toContain('Admin / Data');
    expect(wrapper.text()).toContain('Observability');
  });

  it('displays user displayName in sidebar footer', () => {
    setUser(['OpsManager'], []);
    const wrapper = buildLayout();
    expect(wrapper.find('[data-testid="user-info"]').text()).toContain('Test User');
  });
});
