import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminView from '../src/modules/admin/AdminView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

vi.mock('../src/services/master-data.service.js', () => ({
  masterDataService: {
    listStudents: vi.fn().mockResolvedValue({ students: [], total: 0 }),
    triggerImport: vi.fn().mockResolvedValue({ importJobId: 'job-import-1' }),
    getImportJob: vi.fn().mockResolvedValue({
      id: 'job-import-1',
      status: 'pending',
      entityType: 'students',
      successRows: null,
      failedRows: null,
      errorReportAssetId: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    }),
    triggerExport: vi.fn().mockResolvedValue({ exportJobId: 'job-export-1' }),
    getExportJob: vi.fn().mockResolvedValue({
      id: 'job-export-1',
      status: 'pending',
      entityType: 'students',
      fileAssetId: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    }),
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

describe('AdminView — tab navigation', () => {
  it('renders three tabs: Students, Import, Export', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    expect(wrapper.find('[data-testid="tab-Students"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-Import"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-Export"]').exists()).toBe(true);
  });

  it('defaults to Students tab with search input', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    expect(wrapper.find('[data-testid="student-search"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="students-table"]').exists()).toBe(true);
  });

  it('switches to Import tab', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');
    expect(wrapper.find('[data-testid="import-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="import-trigger"]').exists()).toBe(true);
  });

  it('switches to Export tab', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Export"]').trigger('click');
    expect(wrapper.find('[data-testid="export-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="export-trigger"]').exists()).toBe(true);
  });
});

describe('AdminView — Students tab', () => {
  it('calls listStudents on mount', async () => {
    const { masterDataService } = await import('../src/services/master-data.service.js');
    await mountAdminView(['Administrator'], []);
    expect(vi.mocked(masterDataService.listStudents)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({}),
    );
  });

  it('renders student search input', async () => {
    const wrapper = await mountAdminView(['OpsManager'], []);
    const search = wrapper.find('[data-testid="student-search"]');
    expect(search.exists()).toBe(true);
  });
});

describe('AdminView — Import tab (role enforcement)', () => {
  it('enables "Start Import" button for Administrator', async () => {
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');

    const btn = wrapper.find('[data-testid="import-trigger"]');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('disables "Start Import" button for Auditor', async () => {
    const wrapper = await mountAdminView(['Auditor'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');

    const btn = wrapper.find('[data-testid="import-trigger"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('shows readonly notice for Auditor on Import tab', async () => {
    const wrapper = await mountAdminView(['Auditor'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');

    expect(wrapper.text()).toContain('Read-only');
    expect(wrapper.text()).toContain('Auditor');
  });

  it('does not show readonly notice for OpsManager on Import tab', async () => {
    const wrapper = await mountAdminView(['OpsManager'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');

    expect(wrapper.find('.readonly-notice').exists()).toBe(false);
  });
});

describe('AdminView — Import triggers and job status', () => {
  it('calls triggerImport when Start Import clicked', async () => {
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.useFakeTimers();

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');
    await wrapper.find('[data-testid="import-trigger"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(masterDataService.triggerImport)).toHaveBeenCalledWith('org-1', 'students');
    vi.useRealTimers();
  });

  it('shows import job status after trigger', async () => {
    vi.useFakeTimers();
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');
    await wrapper.find('[data-testid="import-trigger"]').trigger('click');
    await flushPromises();

    // Advance timer to trigger first poll
    vi.advanceTimersByTime(3100);
    await flushPromises();

    expect(wrapper.find('[data-testid="import-job-status"]').exists()).toBe(true);
    vi.useRealTimers();
  });

  it('shows error report download link when failedRows > 0 and errorReportAssetId set', async () => {
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.useFakeTimers();

    vi.mocked(masterDataService.getImportJob).mockResolvedValue({
      id: 'job-import-1',
      status: 'partial_success',
      entityType: 'students',
      successRows: 8,
      failedRows: 2,
      errorReportAssetId: 'asset-err-001',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    } as any);

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');
    await wrapper.find('[data-testid="import-trigger"]').trigger('click');
    await flushPromises();

    vi.advanceTimersByTime(3100);
    await flushPromises();

    const errorRow = wrapper.find('[data-testid="error-report-row"]');
    expect(errorRow.exists()).toBe(true);
    expect(errorRow.text()).toContain('2');

    const downloadLink = wrapper.find('[data-testid="download-error-report"]');
    expect(downloadLink.exists()).toBe(true);
    expect(downloadLink.attributes('href')).toBe('/api/files/asset-err-001');
    expect(downloadLink.text()).toContain('Download Error Report');

    vi.useRealTimers();
  });

  it('does not show error report download link when errorReportAssetId is null', async () => {
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.useFakeTimers();

    vi.mocked(masterDataService.getImportJob).mockResolvedValue({
      id: 'job-import-1',
      status: 'partial_success',
      entityType: 'students',
      successRows: 0,
      failedRows: 3,
      errorReportAssetId: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    } as any);

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Import"]').trigger('click');
    await wrapper.find('[data-testid="import-trigger"]').trigger('click');
    await flushPromises();

    vi.advanceTimersByTime(3100);
    await flushPromises();

    expect(wrapper.find('[data-testid="download-error-report"]').exists()).toBe(false);

    vi.useRealTimers();
  });
});

describe('AdminView — Export triggers and download', () => {
  it('calls triggerExport when Start Export clicked', async () => {
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.useFakeTimers();

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Export"]').trigger('click');
    await wrapper.find('[data-testid="export-trigger"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(masterDataService.triggerExport)).toHaveBeenCalledWith('org-1', 'students');
    vi.useRealTimers();
  });

  it('shows export job status after trigger', async () => {
    vi.useFakeTimers();
    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Export"]').trigger('click');
    await wrapper.find('[data-testid="export-trigger"]').trigger('click');
    await flushPromises();

    vi.advanceTimersByTime(3100);
    await flushPromises();

    expect(wrapper.find('[data-testid="export-job-status"]').exists()).toBe(true);
    vi.useRealTimers();
  });

  it('shows download link when export job completed with fileAssetId', async () => {
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.useFakeTimers();

    vi.mocked(masterDataService.getExportJob).mockResolvedValue({
      id: 'job-export-1',
      status: 'completed',
      entityType: 'students',
      fileAssetId: 'asset-export-001',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    } as any);

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Export"]').trigger('click');
    await wrapper.find('[data-testid="export-trigger"]').trigger('click');
    await flushPromises();

    vi.advanceTimersByTime(3100);
    await flushPromises();

    const downloadRow = wrapper.find('[data-testid="export-download-row"]');
    expect(downloadRow.exists()).toBe(true);

    const downloadLink = wrapper.find('[data-testid="download-export"]');
    expect(downloadLink.exists()).toBe(true);
    expect(downloadLink.attributes('href')).toBe('/api/files/asset-export-001');

    vi.useRealTimers();
  });

  it('export download filename includes entity type and today date', async () => {
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.useFakeTimers();

    vi.mocked(masterDataService.getExportJob).mockResolvedValue({
      id: 'job-export-1',
      status: 'completed',
      entityType: 'students',
      fileAssetId: 'asset-export-002',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    } as any);

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Export"]').trigger('click');
    await wrapper.find('[data-testid="export-trigger"]').trigger('click');
    await flushPromises();

    vi.advanceTimersByTime(3100);
    await flushPromises();

    const downloadLink = wrapper.find('[data-testid="download-export"]');
    const downloadAttr = downloadLink.attributes('download') ?? '';

    // Should match pattern: export_students_YYYY-MM-DD.csv
    expect(downloadAttr).toMatch(/^export_students_\d{4}-\d{2}-\d{2}\.csv$/);

    vi.useRealTimers();
  });

  it('does not show download link when export job status is pending', async () => {
    vi.useFakeTimers();
    const { masterDataService } = await import('../src/services/master-data.service.js');
    vi.mocked(masterDataService.getExportJob).mockResolvedValue({
      id: 'job-export-1',
      status: 'pending',
      entityType: 'students',
      fileAssetId: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    } as any);

    const wrapper = await mountAdminView(['Administrator'], []);
    await wrapper.find('[data-testid="tab-Export"]').trigger('click');
    await wrapper.find('[data-testid="export-trigger"]').trigger('click');
    await flushPromises();

    vi.advanceTimersByTime(3100);
    await flushPromises();

    // Default mock returns status: 'pending', fileAssetId: null
    expect(wrapper.find('[data-testid="export-download-row"]').exists()).toBe(false);

    vi.useRealTimers();
  });
});
