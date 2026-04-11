import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ObservabilityView from '../src/modules/observability/ObservabilityView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

const { mockMetrics } = vi.hoisted(() => ({
  mockMetrics: {
    p95Latency: 250,
    cpuUtilization: 65,
    gpuUtilization: 40,
    errorRate: 1.2,
    collectedAt: new Date().toISOString(),
  },
}));

vi.mock('../src/services/observability.service.js', () => ({
  observabilityService: {
    getMetricsSummary: vi.fn().mockResolvedValue(mockMetrics),
    searchLogs: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
    listThresholds: vi.fn().mockResolvedValue([]),
    createThreshold: vi.fn().mockResolvedValue({ id: 'threshold-new' }),
    updateThreshold: vi.fn(),
    deleteThreshold: vi.fn(),
    listAlertEvents: vi.fn().mockResolvedValue([]),
    acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
    listNotifications: vi.fn().mockResolvedValue([]),
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeUser(roles: string[], permissions: string[]) {
  return {
    token: 'test-token',
    permissions,
    user: {
      id: 'u1',
      username: 'tester',
      displayName: 'Tester',
      orgId: 'org-1',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      roles: roles.map((name, i) => ({ id: `r${i}`, name })),
    },
  };
}

const SIDE_PANEL_STUB = {
  name: 'SidePanel',
  props: ['modelValue', 'title'],
  emits: ['update:modelValue'],
  template: `<div v-if="modelValue" data-testid="side-panel" :data-title="title"><slot /><slot name="footer" /></div>`,
};

async function mountObservabilityView(roles: string[], permissions: string[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setSession(makeUser(roles, permissions));

  const wrapper = mount(ObservabilityView, {
    global: {
      plugins: [pinia],
      stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
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
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'AudioContext');
});

describe('ObservabilityView — tab navigation', () => {
  it('renders four tabs: Metrics, Logs, Alerts, Notifications', async () => {
    const wrapper = await mountObservabilityView(['Administrator'], ['read:observability:*']);
    expect(wrapper.find('[data-testid="tab-metrics"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-logs"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-alerts"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-notifications"]').exists()).toBe(true);
  });

  it('defaults to Metrics tab showing KPI cards', async () => {
    const wrapper = await mountObservabilityView(['Administrator'], ['read:observability:*']);
    expect(wrapper.find('[data-testid="metrics-grid"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="kpi-p95"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="kpi-cpu"]').exists()).toBe(true);
  });

  it('switches to Logs tab', async () => {
    const wrapper = await mountObservabilityView(['OpsManager'], ['read:observability:*']);
    await wrapper.find('[data-testid="tab-logs"]').trigger('click');
    expect(wrapper.find('[data-testid="log-level-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="log-search"]').exists()).toBe(true);
  });

  it('switches to Alerts tab', async () => {
    const wrapper = await mountObservabilityView(['OpsManager'], ['read:observability:*']);
    await wrapper.find('[data-testid="tab-alerts"]').trigger('click');
    expect(wrapper.find('[data-testid="alert-list"]').exists()).toBe(true);
  });

  it('switches to Notifications tab', async () => {
    const wrapper = await mountObservabilityView(['OpsManager'], ['read:observability:*']);
    await wrapper.find('[data-testid="tab-notifications"]').trigger('click');
    expect(wrapper.find('[data-testid="notifications-list"]').exists()).toBe(true);
  });
});

describe('ObservabilityView — Metrics tab', () => {
  it('displays metric values from service', async () => {
    const wrapper = await mountObservabilityView(['Administrator'], ['read:observability:*']);
    const grid = wrapper.find('[data-testid="metrics-grid"]');
    expect(grid.text()).toContain('250');
    expect(grid.text()).toContain('65');
  });

  it('calls getMetricsSummary on mount', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    await mountObservabilityView(['Administrator'], ['read:observability:*']);
    expect(vi.mocked(observabilityService.getMetricsSummary)).toHaveBeenCalledOnce();
  });

  it('shows error state when metrics fetch fails', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.getMetricsSummary).mockRejectedValueOnce(new Error('Network error'));

    const wrapper = await mountObservabilityView(['Auditor'], ['read:observability:*']);
    expect(wrapper.find('.error-state, [data-testid]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Network error');
  });
});

describe('ObservabilityView — Logs tab', () => {
  it('calls searchLogs when switching to Logs tab', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    const wrapper = await mountObservabilityView(['OpsManager'], ['read:observability:*']);
    await wrapper.find('[data-testid="tab-logs"]').trigger('click');
    await wrapper.find('[data-testid="log-level-filter"]').setValue('error');
    // click refresh
    await wrapper.find('.btn-icon').trigger('click');
    await flushPromises();
    expect(vi.mocked(observabilityService.searchLogs)).toHaveBeenCalled();
  });

  it('renders empty state when no logs returned', async () => {
    const wrapper = await mountObservabilityView(['Administrator'], ['read:observability:*']);
    await wrapper.find('[data-testid="tab-logs"]').trigger('click');
    await flushPromises();
    const table = wrapper.find('[data-testid="logs-table"]');
    expect(table.exists()).toBe(true);
  });

  it('renders log entries in the table when returned', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.searchLogs).mockResolvedValueOnce({
      logs: [
        {
          id: 'log-1',
          level: 'error',
          message: 'Something went wrong',
          context: null,
          timestamp: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    const wrapper = await mountObservabilityView(['Administrator'], ['read:observability:*']);
    await wrapper.find('[data-testid="tab-logs"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Something went wrong');
  });
});

describe('ObservabilityView — Alerts tab', () => {
  it('shows alert events from service', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.listAlertEvents).mockResolvedValueOnce([
      {
        id: 'alert-1',
        metricName: 'cpu_utilization',
        operator: 'gt',
        thresholdValue: 90,
        metricValue: 95,
        triggeredAt: new Date().toISOString(),
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
    ] as any);

    const wrapper = await mountObservabilityView(['OpsManager'], ['read:observability:*', 'write:observability:*']);
    await wrapper.find('[data-testid="tab-alerts"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="alert-alert-1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('cpu_utilization');
    expect(wrapper.text()).toContain('95');
  });

  it('shows Acknowledge button for unacknowledged alert when user has write permission', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.listAlertEvents).mockResolvedValueOnce([
      {
        id: 'alert-2',
        metricName: 'error_rate',
        operator: 'gt',
        thresholdValue: 5,
        metricValue: 7,
        triggeredAt: new Date().toISOString(),
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
    ] as any);

    const wrapper = await mountObservabilityView(['OpsManager'], ['write:observability:*']);
    await wrapper.find('[data-testid="tab-alerts"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="ack-alert-alert-2"]').exists()).toBe(true);
  });

  it('hides Acknowledge button for already-acknowledged alerts', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.listAlertEvents).mockResolvedValueOnce([
      {
        id: 'alert-3',
        metricName: 'p95_latency',
        operator: 'gt',
        thresholdValue: 500,
        metricValue: 600,
        triggeredAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: 'admin',
      },
    ] as any);

    const wrapper = await mountObservabilityView(['Administrator'], ['write:observability:*']);
    await wrapper.find('[data-testid="tab-alerts"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="ack-alert-alert-3"]').exists()).toBe(false);
  });

  it('shows Add Threshold button for OpsManager', async () => {
    const wrapper = await mountObservabilityView(['OpsManager'], ['read:observability:*']);
    await wrapper.find('[data-testid="tab-alerts"]').trigger('click');
    expect(wrapper.find('[data-testid="add-threshold-btn"]').exists()).toBe(true);
  });

  it('hides Add Threshold button for Auditor', async () => {
    const wrapper = await mountObservabilityView(['Auditor'], ['read:observability:*']);
    await wrapper.find('[data-testid="tab-alerts"]').trigger('click');
    expect(wrapper.find('[data-testid="add-threshold-btn"]').exists()).toBe(false);
  });
});

describe('ObservabilityView — threshold creation', () => {
  it('opens threshold panel when Add Threshold clicked', async () => {
    const wrapper = await mountObservabilityView(['Administrator'], ['write:observability:*']);
    await wrapper.find('[data-testid="tab-alerts"]').trigger('click');
    await wrapper.find('[data-testid="add-threshold-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="side-panel"]').exists()).toBe(true);
  });

  it('calls createThreshold with correct data on save', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');

    const wrapper = await mountObservabilityView(['Administrator'], ['write:observability:*']);
    await wrapper.find('[data-testid="tab-alerts"]').trigger('click');
    await wrapper.find('[data-testid="add-threshold-btn"]').trigger('click');

    await wrapper.find('[data-testid="threshold-metric"]').setValue('cpu_utilization');
    await wrapper.find('[data-testid="threshold-operator"]').setValue('gt');
    await wrapper.find('[data-testid="threshold-value"]').setValue('85');

    await wrapper.find('[data-testid="save-threshold-btn"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(observabilityService.createThreshold)).toHaveBeenCalledWith(
      expect.objectContaining({
        metricName: 'cpu_utilization',
        operator: 'gt',
      }),
    );
  });
});

describe('ObservabilityView — Notifications tab', () => {
  it('renders notification cards from service', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.listNotifications).mockResolvedValueOnce([
      {
        id: 'notif-1',
        alertEventId: 'alert-1',
        type: 'banner',
        message: 'CPU utilization gt 90 (actual: 95)',
        targetRoleId: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      },
    ] as any);

    const wrapper = await mountObservabilityView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-notifications"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="notif-notif-1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('CPU utilization');
  });

  it('shows Mark read button for unread notifications', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.listNotifications).mockResolvedValueOnce([
      {
        id: 'notif-2',
        alertEventId: null,
        type: 'banner',
        message: 'Error rate elevated',
        targetRoleId: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      },
    ] as any);

    const wrapper = await mountObservabilityView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-notifications"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="mark-read-notif-2"]').exists()).toBe(true);
  });

  it('hides Mark read button for already-read notifications', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.listNotifications).mockResolvedValueOnce([
      {
        id: 'notif-3',
        alertEventId: null,
        type: 'banner',
        message: 'Resolved',
        targetRoleId: null,
        createdAt: new Date().toISOString(),
        readAt: new Date().toISOString(),
      },
    ] as any);

    const wrapper = await mountObservabilityView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-notifications"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="mark-read-notif-3"]').exists()).toBe(false);
  });

  it('plays audible cue when unread audible notifications increase', async () => {
    const { observabilityService } = await import('../src/services/observability.service.js');
    vi.mocked(observabilityService.listNotifications).mockResolvedValueOnce([
      {
        id: 'notif-audible-1',
        alertEventId: 'alert-audible-1',
        type: 'audible',
        message: 'Critical error rate threshold exceeded',
        targetRoleId: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      },
    ] as any);

    const audioCtor = vi.fn(() => {
      const oscillator = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      const gain = {
        connect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      };

      return {
        currentTime: 0,
        destination: {},
        createOscillator: vi.fn(() => oscillator),
        createGain: vi.fn(() => gain),
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: audioCtor,
    });

    const wrapper = await mountObservabilityView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-notifications"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await wrapper.find('[data-testid="unread-only-toggle"]').setValue(true);
    await wrapper.find('[data-testid="unread-only-toggle"]').trigger('change');
    await flushPromises();

    expect(vi.mocked(observabilityService.listNotifications)).toHaveBeenCalled();
    expect(audioCtor).toHaveBeenCalledTimes(1);
  });
});
