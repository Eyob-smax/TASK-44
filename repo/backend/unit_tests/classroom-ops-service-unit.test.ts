import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRepo = {
  findClassroomById: vi.fn(),
  upsertHeartbeat: vi.fn(),
  insertConfidenceSample: vi.fn(),
  createAnomalyEvent: vi.fn(),
  findAnomalyById: vi.fn(),
  createAcknowledgement: vi.fn(),
  createAssignment: vi.fn(),
  createResolution: vi.fn(),
  listClassroomsByCampus: vi.fn(),
  getLatestConfidence: vi.fn(),
  countOpenAnomaliesByClassroom: vi.fn(),
};

vi.mock('../src/modules/classroom-ops/repository.js', () => mockRepo);
vi.mock('../src/app/container.js', () => ({ db: {} }));

const mockGetConfig = vi.fn(() => ({ config: { heartbeatFreshnessSeconds: 60 } }));
vi.mock('../src/modules/configuration/service.js', () => ({ getConfig: mockGetConfig }));

const service = await import('../src/modules/classroom-ops/service.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfig.mockReturnValue({ config: { heartbeatFreshnessSeconds: 60 } });
});

// ============================================================================
// ingestHeartbeat
// ============================================================================

describe('ingestHeartbeat', () => {
  it('throws NotFoundError when classroom does not exist', async () => {
    mockRepo.findClassroomById.mockResolvedValue(null);
    await expect(service.ingestHeartbeat('missing')).rejects.toThrow(/Classroom not found/);
    expect(mockRepo.upsertHeartbeat).not.toHaveBeenCalled();
  });

  it('does not raise an anomaly when last heartbeat is fresh and status is online', async () => {
    mockRepo.findClassroomById.mockResolvedValue({
      id: 'cls-1',
      lastHeartbeatAt: new Date(Date.now() - 10 * 1000), // 10s ago — under 60s threshold
      status: 'online',
    });
    mockRepo.upsertHeartbeat.mockResolvedValue({ id: 'hb-1' });

    await service.ingestHeartbeat('cls-1');
    expect(mockRepo.createAnomalyEvent).not.toHaveBeenCalled();
    expect(mockRepo.upsertHeartbeat).toHaveBeenCalledWith('cls-1', undefined);
  });

  it('raises CONNECTIVITY_LOSS HIGH anomaly when last heartbeat is older than threshold', async () => {
    mockRepo.findClassroomById.mockResolvedValue({
      id: 'cls-1',
      lastHeartbeatAt: new Date(Date.now() - 5 * 60 * 1000), // 5min ago > 60s threshold
      status: 'online',
    });
    mockRepo.upsertHeartbeat.mockResolvedValue({});

    await service.ingestHeartbeat('cls-1');
    expect(mockRepo.createAnomalyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        classroomId: 'cls-1',
        type: 'connectivity_loss',
        severity: 'high',
      }),
    );
  });

  it('raises CONNECTIVITY_LOSS anomaly when classroom status is offline regardless of heartbeat age', async () => {
    mockRepo.findClassroomById.mockResolvedValue({
      id: 'cls-1',
      lastHeartbeatAt: new Date(Date.now() - 5 * 1000), // very recent
      status: 'offline',
    });
    mockRepo.upsertHeartbeat.mockResolvedValue({});

    await service.ingestHeartbeat('cls-1');
    expect(mockRepo.createAnomalyEvent).toHaveBeenCalled();
  });

  it('passes metadata through to the repository upsert', async () => {
    mockRepo.findClassroomById.mockResolvedValue({
      id: 'cls-1',
      lastHeartbeatAt: null,
      status: 'online',
    });
    mockRepo.upsertHeartbeat.mockResolvedValue({});

    await service.ingestHeartbeat('cls-1', { agent: 'edge-1', cpu: 12 });
    expect(mockRepo.upsertHeartbeat).toHaveBeenCalledWith('cls-1', { agent: 'edge-1', cpu: 12 });
  });

  it('does not raise anomaly when lastHeartbeatAt is null and status is online (first heartbeat)', async () => {
    mockRepo.findClassroomById.mockResolvedValue({
      id: 'cls-1',
      lastHeartbeatAt: null,
      status: 'online',
    });
    mockRepo.upsertHeartbeat.mockResolvedValue({});

    await service.ingestHeartbeat('cls-1');
    expect(mockRepo.createAnomalyEvent).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ingestConfidence
// ============================================================================

describe('ingestConfidence', () => {
  it('throws NotFoundError when classroom does not exist', async () => {
    mockRepo.findClassroomById.mockResolvedValue(null);
    await expect(service.ingestConfidence('missing', 0.9)).rejects.toThrow(/Classroom not found/);
    expect(mockRepo.insertConfidenceSample).not.toHaveBeenCalled();
  });

  it('records sample without anomaly when confidence is high (>= 0.7)', async () => {
    mockRepo.findClassroomById.mockResolvedValue({ id: 'cls-1' });
    await service.ingestConfidence('cls-1', 0.9);
    expect(mockRepo.insertConfidenceSample).toHaveBeenCalledWith('cls-1', 0.9);
    expect(mockRepo.createAnomalyEvent).not.toHaveBeenCalled();
  });

  it('raises MEDIUM CONFIDENCE_DROP when confidence is between 0.5 and 0.7', async () => {
    mockRepo.findClassroomById.mockResolvedValue({ id: 'cls-1' });
    await service.ingestConfidence('cls-1', 0.6);
    expect(mockRepo.createAnomalyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confidence_drop',
        severity: 'medium',
        description: expect.stringContaining('60.0%'),
      }),
    );
  });

  it('raises HIGH CONFIDENCE_DROP when confidence is below 0.5', async () => {
    mockRepo.findClassroomById.mockResolvedValue({ id: 'cls-1' });
    await service.ingestConfidence('cls-1', 0.3);
    expect(mockRepo.createAnomalyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confidence_drop',
        severity: 'high',
        description: expect.stringContaining('30.0%'),
      }),
    );
  });

  it('boundary: confidence === 0.7 → no anomaly raised', async () => {
    mockRepo.findClassroomById.mockResolvedValue({ id: 'cls-1' });
    await service.ingestConfidence('cls-1', 0.7);
    expect(mockRepo.createAnomalyEvent).not.toHaveBeenCalled();
  });

  it('boundary: confidence === 0.5 → MEDIUM anomaly (not HIGH)', async () => {
    mockRepo.findClassroomById.mockResolvedValue({ id: 'cls-1' });
    await service.ingestConfidence('cls-1', 0.5);
    expect(mockRepo.createAnomalyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'medium' }),
    );
  });
});

// ============================================================================
// acknowledgeAnomaly
// ============================================================================

describe('acknowledgeAnomaly', () => {
  it('throws NotFoundError when anomaly does not exist', async () => {
    mockRepo.findAnomalyById.mockResolvedValue(null);
    await expect(service.acknowledgeAnomaly('missing', 'usr-1')).rejects.toThrow(
      /Anomaly event not found/,
    );
  });

  it('throws UnprocessableError when anomaly status is not OPEN', async () => {
    mockRepo.findAnomalyById.mockResolvedValue({ id: 'a-1', status: 'resolved' });
    await expect(service.acknowledgeAnomaly('a-1', 'usr-1')).rejects.toThrow(
      /Cannot acknowledge anomaly with status 'resolved'/,
    );
    expect(mockRepo.createAcknowledgement).not.toHaveBeenCalled();
  });

  it('creates acknowledgement when anomaly is OPEN', async () => {
    mockRepo.findAnomalyById.mockResolvedValue({ id: 'a-1', status: 'open' });
    mockRepo.createAcknowledgement.mockResolvedValue({ id: 'ack-1' });
    const result = await service.acknowledgeAnomaly('a-1', 'usr-1');
    expect(mockRepo.createAcknowledgement).toHaveBeenCalledWith('a-1', 'usr-1');
    expect(result).toMatchObject({ id: 'ack-1' });
  });
});

// ============================================================================
// assignAnomaly
// ============================================================================

describe('assignAnomaly', () => {
  it('throws NotFoundError when anomaly does not exist', async () => {
    mockRepo.findAnomalyById.mockResolvedValue(null);
    await expect(service.assignAnomaly('missing', 'assignee', 'assigner')).rejects.toThrow(
      /Anomaly event not found/,
    );
  });

  it('rejects when anomaly is already RESOLVED', async () => {
    mockRepo.findAnomalyById.mockResolvedValue({ id: 'a-1', status: 'resolved' });
    await expect(service.assignAnomaly('a-1', 'assignee', 'assigner')).rejects.toThrow(
      /Cannot assign anomaly with status 'resolved'/,
    );
    expect(mockRepo.createAssignment).not.toHaveBeenCalled();
  });

  it('allows assignment when status is OPEN', async () => {
    mockRepo.findAnomalyById.mockResolvedValue({ id: 'a-1', status: 'open' });
    mockRepo.createAssignment.mockResolvedValue({ id: 'asg-1' });
    await service.assignAnomaly('a-1', 'assignee', 'assigner');
    expect(mockRepo.createAssignment).toHaveBeenCalledWith('a-1', 'assignee', 'assigner');
  });

  it('allows assignment when status is ACKNOWLEDGED', async () => {
    mockRepo.findAnomalyById.mockResolvedValue({ id: 'a-1', status: 'acknowledged' });
    mockRepo.createAssignment.mockResolvedValue({});
    await service.assignAnomaly('a-1', 'assignee', 'assigner');
    expect(mockRepo.createAssignment).toHaveBeenCalled();
  });
});

// ============================================================================
// resolveAnomaly
// ============================================================================

describe('resolveAnomaly', () => {
  it('throws NotFoundError when anomaly does not exist', async () => {
    mockRepo.findAnomalyById.mockResolvedValue(null);
    await expect(service.resolveAnomaly('missing', 'usr-1', 'note')).rejects.toThrow(
      /Anomaly event not found/,
    );
  });

  it('throws UnprocessableError when anomaly is already RESOLVED', async () => {
    mockRepo.findAnomalyById.mockResolvedValue({ id: 'a-1', status: 'resolved' });
    await expect(service.resolveAnomaly('a-1', 'usr-1', 'note')).rejects.toThrow(
      /already resolved/,
    );
    expect(mockRepo.createResolution).not.toHaveBeenCalled();
  });

  it('allows resolution when status is OPEN, ACKNOWLEDGED, or other non-resolved', async () => {
    mockRepo.findAnomalyById.mockResolvedValue({ id: 'a-1', status: 'open' });
    mockRepo.createResolution.mockResolvedValue({ id: 'res-1' });
    await service.resolveAnomaly('a-1', 'usr-1', 'fixed cabling');
    expect(mockRepo.createResolution).toHaveBeenCalledWith('a-1', 'usr-1', 'fixed cabling');
  });
});

// ============================================================================
// getClassroomDashboard
// ============================================================================

describe('getClassroomDashboard', () => {
  it('returns one row per classroom with confidence + open anomaly count joined', async () => {
    mockRepo.listClassroomsByCampus.mockResolvedValue([
      {
        id: 'cls-1',
        name: 'Lab A',
        building: 'B1',
        room: '101',
        status: 'online',
        lastHeartbeatAt: new Date('2026-04-15T12:00:00Z'),
      },
      {
        id: 'cls-2',
        name: 'Lab B',
        building: 'B1',
        room: '102',
        status: 'offline',
        lastHeartbeatAt: null,
      },
    ]);
    mockRepo.getLatestConfidence
      .mockResolvedValueOnce({ confidence: 0.92 })
      .mockResolvedValueOnce(null);
    mockRepo.countOpenAnomaliesByClassroom
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    const result = await service.getClassroomDashboard('cmp-1');
    expect(result).toEqual([
      {
        id: 'cls-1',
        name: 'Lab A',
        building: 'B1',
        room: '101',
        status: 'online',
        lastHeartbeatAt: '2026-04-15T12:00:00.000Z',
        latestConfidence: 0.92,
        openAnomalyCount: 0,
      },
      {
        id: 'cls-2',
        name: 'Lab B',
        building: 'B1',
        room: '102',
        status: 'offline',
        lastHeartbeatAt: null,
        latestConfidence: null,
        openAnomalyCount: 3,
      },
    ]);
  });

  it('returns empty array when campus has no classrooms', async () => {
    mockRepo.listClassroomsByCampus.mockResolvedValue([]);
    expect(await service.getClassroomDashboard('cmp-empty')).toEqual([]);
  });
});
