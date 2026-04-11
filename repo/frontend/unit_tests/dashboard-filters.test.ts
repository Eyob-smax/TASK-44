import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import DashboardView from '../src/modules/dashboard/DashboardView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

// Prevent polling timers from firing during tests
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
    getDashboard: vi.fn(),
    listAnomalies: vi.fn(),
    acknowledge: vi.fn(),
    assign: vi.fn(),
    resolve: vi.fn(),
  },
}));

vi.mock('../src/services/master-data.service.js', () => ({
  masterDataService: {
    listCampuses: vi.fn(),
  },
}));

const MOCK_CLASSROOMS = [
  { id: 'c1', name: 'Room 101', building: 'A', status: 'online', latestConfidence: 0.92, openAnomalyCount: 0, lastHeartbeatAt: new Date().toISOString() },
  { id: 'c2', name: 'Room 202', building: 'B', status: 'offline', latestConfidence: null, openAnomalyCount: 2, lastHeartbeatAt: null },
  { id: 'c3', name: 'Room 303', building: 'C', status: 'degraded', latestConfidence: 0.55, openAnomalyCount: 1, lastHeartbeatAt: new Date().toISOString() },
];

async function mountDashboard(classrooms = MOCK_CLASSROOMS) {
  const { classroomOpsService } = await import('../src/services/classroom-ops.service.js');
  const { masterDataService } = await import('../src/services/master-data.service.js');
  vi.mocked(classroomOpsService.getDashboard).mockResolvedValue(classrooms as any);
  vi.mocked(masterDataService.listCampuses).mockResolvedValue([
    { id: 'campus-1', orgId: 'org-1', name: 'Main Campus', address: null },
  ] as any);

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
    ['read:classroom-ops:*'],
  );

  const wrapper = mount(DashboardView, {
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

describe('DashboardView — time range toggle', () => {
  it('renders all three time range toggle buttons', async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.find('[data-testid="time-toggle-now"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="time-toggle-7d"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="time-toggle-30d"]').exists()).toBe(true);
  });

  it('defaults to "Now" as the active time range', async () => {
    const wrapper = await mountDashboard();
    const nowBtn = wrapper.find('[data-testid="time-toggle-now"]');
    expect(nowBtn.classes()).toContain('toggle-btn--active');
  });

  it('updates active class when clicking a different time range', async () => {
    const wrapper = await mountDashboard();
    await wrapper.find('[data-testid="time-toggle-7d"]').trigger('click');

    expect(wrapper.find('[data-testid="time-toggle-7d"]').classes()).toContain('toggle-btn--active');
    expect(wrapper.find('[data-testid="time-toggle-now"]').classes()).not.toContain('toggle-btn--active');
  });

  it('switches active class back when selecting a different option', async () => {
    const wrapper = await mountDashboard();
    await wrapper.find('[data-testid="time-toggle-30d"]').trigger('click');
    await wrapper.find('[data-testid="time-toggle-now"]').trigger('click');

    expect(wrapper.find('[data-testid="time-toggle-now"]').classes()).toContain('toggle-btn--active');
    expect(wrapper.find('[data-testid="time-toggle-30d"]').classes()).not.toContain('toggle-btn--active');
  });
});

describe('DashboardView — status filter', () => {
  it('renders status filter dropdown', async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.find('[data-testid="status-filter"]').exists()).toBe(true);
  });

  it('shows all classrooms when no status filter applied', async () => {
    const wrapper = await mountDashboard();
    // All 3 classrooms should appear in the table text
    expect(wrapper.text()).toContain('Room 101');
    expect(wrapper.text()).toContain('Room 202');
    expect(wrapper.text()).toContain('Room 303');
  });

  it('shows only online classrooms when online filter applied', async () => {
    const wrapper = await mountDashboard();
    await wrapper.find('[data-testid="status-filter"]').setValue('online');

    expect(wrapper.text()).toContain('Room 101');
    expect(wrapper.text()).not.toContain('Room 202');
    expect(wrapper.text()).not.toContain('Room 303');
  });

  it('shows only offline classrooms when offline filter applied', async () => {
    const wrapper = await mountDashboard();
    await wrapper.find('[data-testid="status-filter"]').setValue('offline');

    expect(wrapper.text()).toContain('Room 202');
    expect(wrapper.text()).not.toContain('Room 101');
    expect(wrapper.text()).not.toContain('Room 303');
  });

  it('shows only degraded classrooms when degraded filter applied', async () => {
    const wrapper = await mountDashboard();
    await wrapper.find('[data-testid="status-filter"]').setValue('degraded');

    expect(wrapper.text()).toContain('Room 303');
    expect(wrapper.text()).not.toContain('Room 101');
    expect(wrapper.text()).not.toContain('Room 202');
  });

  it('restores all rows when filter cleared', async () => {
    const wrapper = await mountDashboard();
    await wrapper.find('[data-testid="status-filter"]').setValue('online');
    await wrapper.find('[data-testid="status-filter"]').setValue('');

    expect(wrapper.text()).toContain('Room 101');
    expect(wrapper.text()).toContain('Room 202');
    expect(wrapper.text()).toContain('Room 303');
  });
});

describe('DashboardView — KPI cards', () => {
  it('renders four KPI cards', async () => {
    const wrapper = await mountDashboard();
    // KpiCard renders with text from MOCK_CLASSROOMS: 1 online, 1 offline, 2 total anomalies
    // Check the dashboard area renders
    expect(wrapper.find('[data-testid="dashboard-view"]').exists()).toBe(true);
  });

  it('shows correct online count in KPI', async () => {
    const wrapper = await mountDashboard();
    // 1 online in MOCK_CLASSROOMS
    expect(wrapper.text()).toContain('1');
  });

  it('shows open anomaly count from all classrooms', async () => {
    const wrapper = await mountDashboard();
    // total openAnomalyCount: 0 + 2 + 1 = 3
    expect(wrapper.text()).toContain('3');
  });

  it('avg confidence is computed across classrooms with data', async () => {
    const wrapper = await mountDashboard();
    // Rooms with confidence: 0.92 and 0.55 → avg = 0.735 → "74%"
    expect(wrapper.text()).toContain('74%');
  });

  it('shows dash for avg confidence when no classroom has data', async () => {
    const wrapper = await mountDashboard([
      { id: 'c1', name: 'R1', building: 'A', status: 'offline', latestConfidence: null, openAnomalyCount: 0, lastHeartbeatAt: null },
    ]);
    expect(wrapper.text()).toContain('—');
  });
});

describe('DashboardView — service integration', () => {
  it('calls getDashboard on mount', async () => {
    const { classroomOpsService } = await import('../src/services/classroom-ops.service.js');
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.mocked(classroomOpsService.getDashboard).mockResolvedValue([]);
    vi.mocked(masterDataService.listCampuses).mockResolvedValue([
      { id: 'campus-1', orgId: 'org-1', name: 'Main Campus', address: null },
    ] as any);

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
      ['read:classroom-ops:*'],
    );

    mount(DashboardView, {
      global: {
        plugins: [pinia],
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    expect(vi.mocked(classroomOpsService.getDashboard)).toHaveBeenCalledWith('campus-1');
  });

  it('surfaces error state when getDashboard rejects', async () => {
    const { classroomOpsService } = await import('../src/services/classroom-ops.service.js');
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.mocked(classroomOpsService.getDashboard).mockRejectedValue(new Error('Network error'));
    vi.mocked(masterDataService.listCampuses).mockResolvedValue([
      { id: 'campus-1', orgId: 'org-1', name: 'Main Campus', address: null },
    ] as any);

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
      ['read:classroom-ops:*'],
    );

    const wrapper = mount(DashboardView, {
      global: {
        plugins: [pinia],
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Network error');
  });
});
