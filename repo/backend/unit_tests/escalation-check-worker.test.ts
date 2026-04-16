import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  parkingFacility: { findUnique: vi.fn() },
  parkingException: { findMany: vi.fn() },
  role: { findFirst: vi.fn() },
  userRole: { findFirst: vi.fn() },
};

const mockCheckUnsettled = vi.fn();
const mockEscalateException = vi.fn();
const mockGetConfig = vi.fn();

vi.mock('../src/app/container.js', () => ({ db: mockDb }));
vi.mock('../src/common/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/modules/parking/service.js', () => ({
  checkUnsettledSessions: mockCheckUnsettled,
}));
vi.mock('../src/modules/parking/repository.js', () => ({
  escalateException: mockEscalateException,
}));
vi.mock('../src/modules/configuration/service.js', () => ({
  getConfig: mockGetConfig,
}));

const { EscalationCheckWorker } = await import('../src/jobs/workers/escalation-check-worker.js');

const FACILITY_ID = 'fac-1';
const ORG_ID = 'org-1';
const OPS_ROLE_ID = 'role-ops';
const SUPERVISOR_USER_ID = 'user-supervisor';

describe('EscalationCheckWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({ config: { parkingEscalationMinutes: 15 } });
    mockCheckUnsettled.mockResolvedValue([]);
  });

  it('returns early and warns when the facility does not exist', async () => {
    mockDb.parkingFacility.findUnique.mockResolvedValue(null);

    const worker = new EscalationCheckWorker();
    await worker.handle({ facilityId: 'missing-fac' });

    expect(mockDb.parkingException.findMany).not.toHaveBeenCalled();
    expect(mockEscalateException).not.toHaveBeenCalled();
  });

  it('returns early when no open exceptions exist', async () => {
    mockDb.parkingFacility.findUnique.mockResolvedValue({
      id: FACILITY_ID,
      campus: { orgId: ORG_ID },
    });
    mockDb.parkingException.findMany.mockResolvedValue([]);

    const worker = new EscalationCheckWorker();
    await worker.handle({ facilityId: FACILITY_ID });

    expect(mockDb.role.findFirst).not.toHaveBeenCalled();
    expect(mockEscalateException).not.toHaveBeenCalled();
  });

  it('does not escalate when no open exception has crossed the threshold', async () => {
    mockDb.parkingFacility.findUnique.mockResolvedValue({
      id: FACILITY_ID,
      campus: { orgId: ORG_ID },
    });
    mockDb.parkingException.findMany.mockResolvedValue([
      { id: 'exc-fresh', status: 'open', createdAt: new Date(Date.now() - 60 * 1000) },
    ]);

    const worker = new EscalationCheckWorker();
    await worker.handle({ facilityId: FACILITY_ID });

    expect(mockDb.role.findFirst).not.toHaveBeenCalled();
    expect(mockEscalateException).not.toHaveBeenCalled();
  });

  it('warns and returns when the OpsManager role is not seeded', async () => {
    mockDb.parkingFacility.findUnique.mockResolvedValue({
      id: FACILITY_ID,
      campus: { orgId: ORG_ID },
    });
    mockDb.parkingException.findMany.mockResolvedValue([
      { id: 'exc-old', status: 'open', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
    ]);
    mockDb.role.findFirst.mockResolvedValue(null);

    const worker = new EscalationCheckWorker();
    await worker.handle({ facilityId: FACILITY_ID });

    expect(mockEscalateException).not.toHaveBeenCalled();
  });

  it('warns and returns when no org-scoped OpsManager user exists', async () => {
    mockDb.parkingFacility.findUnique.mockResolvedValue({
      id: FACILITY_ID,
      campus: { orgId: ORG_ID },
    });
    mockDb.parkingException.findMany.mockResolvedValue([
      { id: 'exc-old', status: 'open', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
    ]);
    mockDb.role.findFirst.mockResolvedValue({ id: OPS_ROLE_ID });
    mockDb.userRole.findFirst.mockResolvedValue(null);

    const worker = new EscalationCheckWorker();
    await worker.handle({ facilityId: FACILITY_ID });

    expect(mockEscalateException).not.toHaveBeenCalled();
  });

  it('escalates every eligible open exception to the org-scoped supervisor', async () => {
    mockDb.parkingFacility.findUnique.mockResolvedValue({
      id: FACILITY_ID,
      campus: { orgId: ORG_ID },
    });
    const now = Date.now();
    mockDb.parkingException.findMany.mockResolvedValue([
      { id: 'exc-eligible-1', status: 'open', createdAt: new Date(now - 20 * 60 * 1000) },
      { id: 'exc-fresh', status: 'open', createdAt: new Date(now - 60 * 1000) },
      { id: 'exc-eligible-2', status: 'open', createdAt: new Date(now - 30 * 60 * 1000) },
    ]);
    mockDb.role.findFirst.mockResolvedValue({ id: OPS_ROLE_ID });
    mockDb.userRole.findFirst.mockResolvedValue({ userId: SUPERVISOR_USER_ID });
    mockEscalateException.mockResolvedValue({});

    const worker = new EscalationCheckWorker();
    await worker.handle({ facilityId: FACILITY_ID });

    expect(mockEscalateException).toHaveBeenCalledTimes(2);
    expect(mockEscalateException).toHaveBeenCalledWith('exc-eligible-1', SUPERVISOR_USER_ID);
    expect(mockEscalateException).toHaveBeenCalledWith('exc-eligible-2', SUPERVISOR_USER_ID);
  });

  it('continues escalating remaining exceptions when one repo call throws', async () => {
    mockDb.parkingFacility.findUnique.mockResolvedValue({
      id: FACILITY_ID,
      campus: { orgId: ORG_ID },
    });
    const now = Date.now();
    mockDb.parkingException.findMany.mockResolvedValue([
      { id: 'exc-fail', status: 'open', createdAt: new Date(now - 20 * 60 * 1000) },
      { id: 'exc-ok', status: 'open', createdAt: new Date(now - 20 * 60 * 1000) },
    ]);
    mockDb.role.findFirst.mockResolvedValue({ id: OPS_ROLE_ID });
    mockDb.userRole.findFirst.mockResolvedValue({ userId: SUPERVISOR_USER_ID });
    mockEscalateException
      .mockRejectedValueOnce(new Error('DB deadlock'))
      .mockResolvedValueOnce({});

    const worker = new EscalationCheckWorker();
    await expect(worker.handle({ facilityId: FACILITY_ID })).resolves.toBeUndefined();
    expect(mockEscalateException).toHaveBeenCalledTimes(2);
  });

  it('still processes exceptions after generating unsettled sessions', async () => {
    mockCheckUnsettled.mockResolvedValue(['unsettled-1', 'unsettled-2']);
    mockDb.parkingFacility.findUnique.mockResolvedValue({
      id: FACILITY_ID,
      campus: { orgId: ORG_ID },
    });
    mockDb.parkingException.findMany.mockResolvedValue([]);

    const worker = new EscalationCheckWorker();
    await worker.handle({ facilityId: FACILITY_ID });

    expect(mockCheckUnsettled).toHaveBeenCalledWith(FACILITY_ID);
  });

  it('exposes escalation_check as its worker type', () => {
    expect(new EscalationCheckWorker().type).toBe('escalation_check');
  });
});
