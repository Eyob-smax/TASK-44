import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/api-client.js', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  apiClient: {
    post: vi.fn(),
  },
}));

const { get, post, patch, del, apiClient } = await import('../src/services/api-client.js');
const { authService } = await import('../src/services/auth.service.js');
const { masterDataService } = await import('../src/services/master-data.service.js');
const { classroomOpsService } = await import('../src/services/classroom-ops.service.js');
const { parkingService } = await import('../src/services/parking.service.js');
const { observabilityService } = await import('../src/services/observability.service.js');
const { afterSalesService } = await import('../src/services/after-sales.service.js');

describe('service adapter routing contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(get).mockResolvedValue({} as any);
    vi.mocked(post).mockResolvedValue({} as any);
    vi.mocked(patch).mockResolvedValue({} as any);
    vi.mocked(del).mockResolvedValue(undefined as any);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { id: 'file-1' } } } as any);
  });

  it('authService uses expected auth endpoints', async () => {
    await authService.login('demo.admin', 'password');
    await authService.me();
    await authService.logout();

    expect(post).toHaveBeenCalledWith('/auth/login', {
      username: 'demo.admin',
      password: 'password',
    });
    expect(get).toHaveBeenCalledWith('/auth/me');
    expect(post).toHaveBeenCalledWith('/auth/logout');
  });

  it('masterDataService passes org-scoped paths and query params', async () => {
    await masterDataService.listStudents('org-7', { search: 'Ada' }, 3, 25);
    await masterDataService.getImportJob('org-7', 'job-1');
    await masterDataService.getExportJob('org-7', 'job-2');

    expect(get).toHaveBeenCalledWith('/orgs/org-7/students', {
      search: 'Ada',
      page: 3,
      limit: 25,
    });
    expect(get).toHaveBeenCalledWith('/orgs/org-7/import/job-1');
    expect(get).toHaveBeenCalledWith('/orgs/org-7/export/job-2');
  });

  it('classroomOpsService routes to dashboard and anomaly actions', async () => {
    await classroomOpsService.getDashboard('campus-1');
    await classroomOpsService.assign('anom-1', 'user-2');
    await classroomOpsService.resolve('anom-1', 'Resolved after manual verification');

    expect(get).toHaveBeenCalledWith('/classroom-ops/dashboard', { campusId: 'campus-1' });
    expect(post).toHaveBeenCalledWith('/classroom-ops/anomalies/anom-1/assign', { assignedToUserId: 'user-2' });
    expect(post).toHaveBeenCalledWith('/classroom-ops/anomalies/anom-1/resolve', {
      resolutionNote: 'Resolved after manual verification',
    });
  });

  it('parkingService sends filters and action payload correctly', async () => {
    await parkingService.listExceptions({ status: 'open', type: 'overtime' }, 2, 10);
    await parkingService.resolveException('exc-9', 'Session settled and closed');

    expect(get).toHaveBeenCalledWith('/parking/exceptions', {
      status: 'open',
      type: 'overtime',
      page: 2,
      limit: 10,
    });
    expect(post).toHaveBeenCalledWith('/parking/exceptions/exc-9/resolve', {
      resolutionNote: 'Session settled and closed',
    });
  });

  it('observabilityService routes threshold update/delete and alert ack', async () => {
    await observabilityService.updateThreshold('thr-1', { thresholdValue: 92, isActive: false });
    await observabilityService.deleteThreshold('thr-1');
    await observabilityService.acknowledgeAlert('alert-1');

    expect(patch).toHaveBeenCalledWith('/observability/thresholds/thr-1', {
      thresholdValue: 92,
      isActive: false,
    });
    expect(del).toHaveBeenCalledWith('/observability/thresholds/thr-1');
    expect(post).toHaveBeenCalledWith('/observability/alerts/alert-1/acknowledge');
  });

  it('afterSalesService uploadEvidenceFile uses multipart request and unwraps payload', async () => {
    const file = new File(['dummy'], 'evidence.png', { type: 'image/png' });

    const result = await afterSalesService.uploadEvidenceFile(file);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiClient.post).mock.calls[0]?.[0]).toBe('/files');

    const body = vi.mocked(apiClient.post).mock.calls[0]?.[1] as FormData;
    expect(body).toBeInstanceOf(FormData);

    const options = vi.mocked(apiClient.post).mock.calls[0]?.[2] as { headers?: Record<string, string> };
    expect(options.headers?.['Content-Type']).toBe('multipart/form-data');

    expect(result).toEqual({ id: 'file-1' });
  });
});
