import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminView from '../src/modules/admin/AdminView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

const { mockConfigResponse, mockBackupsResponse } = vi.hoisted(() => ({
  mockConfigResponse: {
    config: {
      heartbeatFreshnessSeconds: 120,
      storedValueEnabled: false,
      maxUploadSizeBytes: 10485760,
      acceptedImageMimeTypes: ['image/jpeg', 'image/png'],
      logRetentionDays: 30,
      parkingEscalationMinutes: 15,
      backupRetentionDays: 14,
      storagePath: '/data/object-storage',
      backupPath: '/data/backups',
    },
    updatedAt: new Date().toISOString(),
  },
  mockBackupsResponse: {
    backups: [
      {
        id: 'backup-1',
        type: 'full',
        status: 'completed',
        sizeBytes: '4096',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
      },
      {
        id: 'backup-2',
        type: 'full',
        status: 'running',
        sizeBytes: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
      },
    ],
  },
}));

vi.mock('../src/services/master-data.service.js', () => ({
  masterDataService: {
    listStudents: vi.fn().mockResolvedValue({ students: [], total: 0 }),
    triggerImport: vi.fn().mockResolvedValue({ importJobId: 'job-import-1' }),
    getImportJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'pending', successRows: null, failedRows: null, errorReportAssetId: null }),
    triggerExport: vi.fn().mockResolvedValue({ exportJobId: 'job-export-1' }),
    getExportJob: vi.fn().mockResolvedValue({ id: 'job-e1', status: 'pending', fileAssetId: null }),
  },
}));

vi.mock('../src/services/api-client.js', () => ({
  get: vi.fn(async (url: string) => {
    if (url === '/config') return mockConfigResponse;
    if (url === '/backups') return mockBackupsResponse;
    return {};
  }),
  post: vi.fn().mockResolvedValue({ backupId: 'backup-new' }),
  patch: vi.fn().mockResolvedValue({
    ...mockConfigResponse,
    config: { ...mockConfigResponse.config, heartbeatFreshnessSeconds: 60 },
  }),
  del: vi.fn().mockResolvedValue({}),
  apiClient: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
  registerTokenGetter: vi.fn(),
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

async function mountAdminView(roles: string[], permissions: string[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setSession(makeUser(roles, permissions));

  const wrapper = mount(AdminView, {
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

describe('AdminView — new tabs visible', () => {
  it('renders Config and Backups tabs in addition to original tabs', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    expect(wrapper.find('[data-testid="tab-Config"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-Backups"]').exists()).toBe(true);
  });
});

describe('AdminView — Config tab', () => {
  it('shows config section placeholder before explicit config load', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Config"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="config-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="config-heartbeat"]').exists()).toBe(false);
  });

  it('does not render storage paths before config data is loaded', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Config"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Runtime Configuration');
    expect(wrapper.text()).not.toContain('/data/object-storage');
    expect(wrapper.text()).not.toContain('/data/backups');
  });

  it('does not show Save Changes button until config data is loaded', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Config"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="save-config-btn"]').exists()).toBe(false);
  });

  it('hides Save Changes button for Auditor', async () => {
    const wrapper = await mountAdminView(['Auditor'], []);
    await wrapper.find('[data-testid="tab-Config"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="save-config-btn"]').exists()).toBe(false);
  });

  it('does not show readonly notice before config data is loaded', async () => {
    const wrapper = await mountAdminView(['OpsManager'], []);
    await wrapper.find('[data-testid="tab-Config"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Read-only');
  });

  it('does not render config inputs before data load', async () => {
    const wrapper = await mountAdminView(['Auditor'], []);
    await wrapper.find('[data-testid="tab-Config"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="config-heartbeat"]').exists()).toBe(false);
  });

  it('does not call patch /config when Save Changes button is not rendered', async () => {
    const { patch } = await import('../src/services/api-client.js');

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Config"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="save-config-btn"]').exists()).toBe(false);
    expect(vi.mocked(patch)).not.toHaveBeenCalled();
  });
});

describe('AdminView — Backups tab', () => {
  it('loads and displays backup list', async () => {
    const wrapper = await mountAdminView(['OpsManager'], []);
    await wrapper.find('[data-testid="tab-Backups"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="backups-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('completed');
    expect(wrapper.text()).toContain('running');
  });

  it('shows Trigger Backup button for Administrator', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Backups"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="trigger-backup-btn"]').exists()).toBe(true);
  });

  it('hides Trigger Backup button for non-Administrator', async () => {
    const wrapper = await mountAdminView(['OpsManager'], []);
    await wrapper.find('[data-testid="tab-Backups"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="trigger-backup-btn"]').exists()).toBe(false);
  });

  it('calls POST /backups when Trigger Backup is clicked', async () => {
    const { post } = await import('../src/services/api-client.js');

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Backups"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="trigger-backup-btn"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(post)).toHaveBeenCalledWith('/backups', { type: 'full' });
  });

  it('shows Restore button only for completed backups', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Backups"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    // backup-1 is completed — restore button should exist
    expect(wrapper.find('[data-testid="restore-backup-1"]').exists()).toBe(true);
    // backup-2 is running — restore button should NOT exist
    expect(wrapper.find('[data-testid="restore-backup-2"]').exists()).toBe(false);
  });

  it('hides Restore buttons for non-Administrator', async () => {
    const wrapper = await mountAdminView(['OpsManager'], []);
    await wrapper.find('[data-testid="tab-Backups"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="restore-backup-1"]').exists()).toBe(false);
  });

  it('calls POST /backups/:id/restore when Restore is clicked', async () => {
    const { post } = await import('../src/services/api-client.js');

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Backups"]').trigger('click');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="restore-backup-1"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(post)).toHaveBeenCalledWith('/backups/backup-1/restore');
  });
});
