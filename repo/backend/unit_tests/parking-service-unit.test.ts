import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  parkingReader: { findUnique: vi.fn() },
  role: { findFirst: vi.fn() },
  userRole: { findFirst: vi.fn() },
};

const mockRepo = {
  findFacilityById: vi.fn(),
  createParkingEvent: vi.fn(),
  findActiveSessionByPlate: vi.fn(),
  createSession: vi.fn(),
  completeSession: vi.fn(),
  createException: vi.fn(),
  findActiveSessionsOlderThan: vi.fn(),
  hasOpenOvertimeException: vi.fn(),
  findCompletedSessionsOlderThan: vi.fn(),
  hasUnsettledException: vi.fn(),
  findOpenExceptionsByFacility: vi.fn(),
  escalateException: vi.fn(),
  getParkingStatus: vi.fn(),
};

vi.mock('../src/app/container.js', () => ({ db: mockDb }));
vi.mock('../src/modules/parking/repository.js', () => mockRepo);

const mockGetConfig = vi.fn(() => ({ config: { parkingEscalationMinutes: 15 } }));
vi.mock('../src/modules/configuration/service.js', () => ({ getConfig: mockGetConfig }));

const service = await import('../src/modules/parking/service.js');

const READER_ID = 'rdr-1';
const FACILITY_ID = 'fac-1';
const ORG_ID = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfig.mockReturnValue({ config: { parkingEscalationMinutes: 15 } });
});

// ============================================================================
// ingestParkingEvent
// ============================================================================

describe('ingestParkingEvent', () => {
  it('throws NotFoundError when reader does not exist', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue(null);
    await expect(
      service.ingestParkingEvent({
        readerId: 'missing',
        plateNumber: 'ABC123',
        eventType: 'entry',
      }),
    ).rejects.toThrow(/Parking reader not found/);
  });

  it('throws NotFoundError when org-scoped check rejects cross-tenant access', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue({ id: READER_ID, facilityId: FACILITY_ID });
    mockRepo.findFacilityById.mockResolvedValue({ campus: { orgId: 'OTHER-ORG' } });
    await expect(
      service.ingestParkingEvent(
        { readerId: READER_ID, plateNumber: 'ABC123', eventType: 'entry' },
        ORG_ID,
      ),
    ).rejects.toThrow(/Parking reader not found/);
  });

  it('returns no_plate_exception when plate is missing', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue({ id: READER_ID, facilityId: FACILITY_ID });
    mockRepo.createParkingEvent.mockResolvedValue({ id: 'evt-1' });

    const result = await service.ingestParkingEvent({
      readerId: READER_ID,
      plateNumber: null,
      eventType: 'entry',
    });
    expect(result.action).toBe('no_plate_exception');
    expect(mockRepo.createSession).not.toHaveBeenCalled();
  });

  it('creates a new session for entry event with no existing active session', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue({ id: READER_ID, facilityId: FACILITY_ID });
    mockRepo.createParkingEvent.mockResolvedValue({ id: 'evt-1' });
    mockRepo.findActiveSessionByPlate.mockResolvedValue(null);
    mockRepo.createSession.mockResolvedValue({ id: 'sess-1' });

    const capturedAt = new Date('2026-04-15T10:00:00Z');
    const result = await service.ingestParkingEvent({
      readerId: READER_ID,
      plateNumber: 'ABC123',
      eventType: 'entry',
      capturedAt,
    });
    expect(result.action).toBe('session_created');
    expect(mockRepo.createSession).toHaveBeenCalledWith({
      facilityId: FACILITY_ID,
      plateNumber: 'ABC123',
      entryEventId: 'evt-1',
      entryAt: capturedAt,
    });
  });

  it('raises duplicate_plate exception when entry event finds existing active session', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue({ id: READER_ID, facilityId: FACILITY_ID });
    mockRepo.createParkingEvent.mockResolvedValue({ id: 'evt-1' });
    mockRepo.findActiveSessionByPlate.mockResolvedValue({ id: 'sess-existing' });

    const result = await service.ingestParkingEvent({
      readerId: READER_ID,
      plateNumber: 'ABC123',
      eventType: 'entry',
    });
    expect(result.action).toBe('duplicate_plate_exception');
    expect(mockRepo.createException).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'duplicate_plate',
        relatedSessionId: 'sess-existing',
      }),
    );
    expect(mockRepo.createSession).not.toHaveBeenCalled();
  });

  it('completes the active session on a matching exit event', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue({ id: READER_ID, facilityId: FACILITY_ID });
    mockRepo.createParkingEvent.mockResolvedValue({ id: 'evt-2' });
    mockRepo.findActiveSessionByPlate.mockResolvedValue({ id: 'sess-1' });
    mockRepo.completeSession.mockResolvedValue({ id: 'sess-1', exitEventId: 'evt-2' });

    const capturedAt = new Date('2026-04-15T11:00:00Z');
    const result = await service.ingestParkingEvent({
      readerId: READER_ID,
      plateNumber: 'ABC123',
      eventType: 'exit',
      capturedAt,
    });
    expect(result.action).toBe('session_completed');
    expect(mockRepo.completeSession).toHaveBeenCalledWith('sess-1', 'evt-2', capturedAt);
  });

  it('raises inconsistent_entry_exit exception when exit has no matching session', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue({ id: READER_ID, facilityId: FACILITY_ID });
    mockRepo.createParkingEvent.mockResolvedValue({ id: 'evt-2' });
    mockRepo.findActiveSessionByPlate.mockResolvedValue(null);

    const result = await service.ingestParkingEvent({
      readerId: READER_ID,
      plateNumber: 'ABC123',
      eventType: 'exit',
    });
    expect(result.action).toBe('inconsistent_entry_exit_exception');
    expect(mockRepo.createException).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'inconsistent_entry_exit',
      }),
    );
  });

  it('returns noop action for an unknown event type', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue({ id: READER_ID, facilityId: FACILITY_ID });
    mockRepo.createParkingEvent.mockResolvedValue({ id: 'evt-3' });

    const result = await service.ingestParkingEvent({
      readerId: READER_ID,
      plateNumber: 'ABC123',
      eventType: 'maintenance',
    });
    expect(result.action).toBe('noop');
  });

  it('passes org-scoped facility lookup when requesterOrgId matches', async () => {
    mockDb.parkingReader.findUnique.mockResolvedValue({ id: READER_ID, facilityId: FACILITY_ID });
    mockRepo.findFacilityById.mockResolvedValue({ campus: { orgId: ORG_ID } });
    mockRepo.createParkingEvent.mockResolvedValue({ id: 'evt-1' });
    mockRepo.findActiveSessionByPlate.mockResolvedValue(null);
    mockRepo.createSession.mockResolvedValue({ id: 'sess-1' });

    const result = await service.ingestParkingEvent(
      { readerId: READER_ID, plateNumber: 'X', eventType: 'entry' },
      ORG_ID,
    );
    expect(result.action).toBe('session_created');
  });
});

// ============================================================================
// checkOvertimeSessions
// ============================================================================

describe('checkOvertimeSessions', () => {
  it('returns empty when no sessions exceed threshold', async () => {
    mockRepo.findActiveSessionsOlderThan.mockResolvedValue([]);
    const result = await service.checkOvertimeSessions(FACILITY_ID);
    expect(result).toEqual([]);
    expect(mockRepo.createException).not.toHaveBeenCalled();
  });

  it('creates overtime exception only for sessions without an existing one', async () => {
    mockRepo.findActiveSessionsOlderThan.mockResolvedValue([
      { id: 'sess-1', plateNumber: 'A1' },
      { id: 'sess-2', plateNumber: 'A2' },
    ]);
    mockRepo.hasOpenOvertimeException
      .mockResolvedValueOnce(false) // sess-1 → create
      .mockResolvedValueOnce(true);  // sess-2 → skip

    const result = await service.checkOvertimeSessions(FACILITY_ID);
    expect(result).toEqual(['sess-1']);
    expect(mockRepo.createException).toHaveBeenCalledTimes(1);
    expect(mockRepo.createException).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'overtime', relatedSessionId: 'sess-1' }),
    );
  });

  it('honors custom overtimeThresholdHours param', async () => {
    mockRepo.findActiveSessionsOlderThan.mockResolvedValue([]);
    await service.checkOvertimeSessions(FACILITY_ID, 8);
    const call = mockRepo.findActiveSessionsOlderThan.mock.calls[0];
    const threshold = call[1] as Date;
    const expected = Date.now() - 8 * 60 * 60 * 1000;
    expect(threshold.getTime()).toBeGreaterThan(expected - 1000);
    expect(threshold.getTime()).toBeLessThan(expected + 1000);
  });
});

// ============================================================================
// checkUnsettledSessions
// ============================================================================

describe('checkUnsettledSessions', () => {
  it('returns empty when no completed sessions exceed unsettled threshold', async () => {
    mockRepo.findCompletedSessionsOlderThan.mockResolvedValue([]);
    expect(await service.checkUnsettledSessions(FACILITY_ID)).toEqual([]);
  });

  it('creates UNSETTLED exception for sessions without existing one', async () => {
    mockRepo.findCompletedSessionsOlderThan.mockResolvedValue([
      { id: 'sess-A', plateNumber: 'PA' },
      { id: 'sess-B', plateNumber: 'PB' },
    ]);
    mockRepo.hasUnsettledException
      .mockResolvedValueOnce(true)   // sess-A → skip
      .mockResolvedValueOnce(false); // sess-B → create

    const result = await service.checkUnsettledSessions(FACILITY_ID);
    expect(result).toEqual(['sess-B']);
    expect(mockRepo.createException).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unsettled', relatedSessionId: 'sess-B' }),
    );
  });
});

// ============================================================================
// escalateDueExceptions
// ============================================================================

describe('escalateDueExceptions', () => {
  it('returns empty when no exceptions exist', async () => {
    mockRepo.findOpenExceptionsByFacility.mockResolvedValue([]);
    expect(await service.escalateDueExceptions(FACILITY_ID)).toEqual([]);
    expect(mockDb.role.findFirst).not.toHaveBeenCalled();
  });

  it('returns empty when none of the exceptions are eligible (too fresh)', async () => {
    mockRepo.findOpenExceptionsByFacility.mockResolvedValue([
      { id: 'ex-fresh', status: 'open', createdAt: new Date(Date.now() - 60 * 1000) }, // 1min
    ]);
    expect(await service.escalateDueExceptions(FACILITY_ID)).toEqual([]);
    expect(mockDb.role.findFirst).not.toHaveBeenCalled();
  });

  it('returns empty when OpsManager role is not seeded', async () => {
    mockRepo.findOpenExceptionsByFacility.mockResolvedValue([
      { id: 'ex-old', status: 'open', createdAt: new Date(Date.now() - 30 * 60 * 1000) },
    ]);
    mockDb.role.findFirst.mockResolvedValue(null);
    expect(await service.escalateDueExceptions(FACILITY_ID)).toEqual([]);
    expect(mockRepo.escalateException).not.toHaveBeenCalled();
  });

  it('returns empty when no user has OpsManager role', async () => {
    mockRepo.findOpenExceptionsByFacility.mockResolvedValue([
      { id: 'ex-old', status: 'open', createdAt: new Date(Date.now() - 30 * 60 * 1000) },
    ]);
    mockDb.role.findFirst.mockResolvedValue({ id: 'role-ops' });
    mockDb.userRole.findFirst.mockResolvedValue(null);
    expect(await service.escalateDueExceptions(FACILITY_ID)).toEqual([]);
    expect(mockRepo.escalateException).not.toHaveBeenCalled();
  });

  it('escalates only the eligible exceptions to the supervisor', async () => {
    mockRepo.findOpenExceptionsByFacility.mockResolvedValue([
      { id: 'ex-old-1', status: 'open', createdAt: new Date(Date.now() - 30 * 60 * 1000) },
      { id: 'ex-fresh', status: 'open', createdAt: new Date(Date.now() - 60 * 1000) },
      { id: 'ex-old-2', status: 'open', createdAt: new Date(Date.now() - 25 * 60 * 1000) },
    ]);
    mockDb.role.findFirst.mockResolvedValue({ id: 'role-ops' });
    mockDb.userRole.findFirst.mockResolvedValue({ userId: 'usr-supervisor' });
    mockRepo.escalateException.mockResolvedValue({});

    const result = await service.escalateDueExceptions(FACILITY_ID);
    expect(result).toEqual(['ex-old-1', 'ex-old-2']);
    expect(mockRepo.escalateException).toHaveBeenCalledWith('ex-old-1', 'usr-supervisor');
    expect(mockRepo.escalateException).toHaveBeenCalledWith('ex-old-2', 'usr-supervisor');
  });
});

// ============================================================================
// getParkingStatusSummary
// ============================================================================

describe('getParkingStatusSummary', () => {
  it('delegates directly to repository', async () => {
    mockRepo.getParkingStatus.mockResolvedValue({ totalSpaces: 50, occupiedSpaces: 30 });
    const result = await service.getParkingStatusSummary(FACILITY_ID, ORG_ID);
    expect(mockRepo.getParkingStatus).toHaveBeenCalledWith(FACILITY_ID, ORG_ID);
    expect(result).toMatchObject({ totalSpaces: 50, occupiedSpaces: 30 });
  });
});
