import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ClassroomOpsView from '../src/modules/classroom-ops/ClassroomOpsView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

vi.mock('../src/utils/poll.js', async () => {
  const { ref } = await import('vue');
  return {
    usePolling: (fetchFn: () => Promise<any>) => {
      const data = ref<any>(null);
      const error = ref<Error | null>(null);
      const isLoading = ref(false);
      return {
        data,
        error,
        isLoading,
        start: vi.fn(async () => {
          isLoading.value = true;
          try {
            const result = await fetchFn();
            data.value = result;
          } catch (e: any) {
            error.value = e;
          } finally {
            isLoading.value = false;
          }
        }),
        stop: vi.fn(),
      };
    },
  };
});

vi.mock('../src/services/classroom-ops.service.js', () => ({
  classroomOpsService: {
    listAnomalies: vi.fn(),
    acknowledge: vi.fn(),
    assign: vi.fn(),
    resolve: vi.fn(),
  },
}));

const baseAnomaly = {
  id: 'anom-1',
  classroomId: 'class-1',
  classroomName: 'Room 101',
  type: 'connectivity_loss',
  severity: 'high',
  description: 'Network down',
  detectedAt: new Date().toISOString(),
  status: 'open',
  acknowledgement: null,
  assignment: null,
  resolution: null,
};

async function mountView() {
  const { classroomOpsService } = await import('../src/services/classroom-ops.service.js');
  vi.mocked(classroomOpsService.listAnomalies).mockResolvedValue({
    anomalies: [baseAnomaly as any],
    total: 1,
  });
  vi.mocked(classroomOpsService.acknowledge).mockResolvedValue({ ...baseAnomaly, status: 'acknowledged' } as any);
  vi.mocked(classroomOpsService.assign).mockResolvedValue({ ...baseAnomaly, status: 'assigned' } as any);
  vi.mocked(classroomOpsService.resolve).mockResolvedValue({ ...baseAnomaly, status: 'resolved' } as any);

  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.hydrateFromToken(
    {
      id: 'user-1',
      username: 'ops',
      displayName: 'Ops User',
      orgId: 'org-1',
      isActive: true,
      lastLoginAt: null,
      roles: [{ id: 'role-1', name: 'OpsManager' }],
      createdAt: new Date().toISOString(),
    },
    ['read:classroom-ops:*', 'write:classroom-ops:*'],
  );

  const wrapper = mount(ClassroomOpsView, {
    global: {
      plugins: [pinia],
      stubs: { Teleport: true },
    },
  });

  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ClassroomOpsView', () => {
  it('renders loaded anomaly rows from frontend module service', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="classroom-ops-view"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Room 101');
    expect(wrapper.text()).toContain('connectivity_loss');
  });

  it('acknowledges an anomaly from row action', async () => {
    const { classroomOpsService } = await import('../src/services/classroom-ops.service.js');
    const wrapper = await mountView();

    await wrapper.find('[data-testid="ack-anom-1"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(classroomOpsService.acknowledge)).toHaveBeenCalledWith('anom-1');
  });

  it('requires resolution note before submitting resolve action', async () => {
    const wrapper = await mountView();

    await wrapper.find('[data-testid="resolve-anom-1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="submit-resolve"]').trigger('click');

    expect(wrapper.text()).toContain('Resolution note is required and cannot be empty.');
  });

  it('submits resolve action with semantic payload', async () => {
    const { classroomOpsService } = await import('../src/services/classroom-ops.service.js');
    const wrapper = await mountView();

    await wrapper.find('[data-testid="resolve-anom-1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="resolution-note-input"]').setValue('Resolved by replacing switch');
    await wrapper.find('[data-testid="submit-resolve"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(classroomOpsService.resolve)).toHaveBeenCalledWith('anom-1', 'Resolved by replacing switch');
  });
});
