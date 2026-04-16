import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRepo = {
  insertMetric: vi.fn(),
  getLatestMetrics: vi.fn(),
  findActiveThresholdsForMetric: vi.fn(),
  createAlertEvent: vi.fn(),
  createNotification: vi.fn(),
  searchLogs: vi.fn(),
  createAlertThreshold: vi.fn(),
  listAlertThresholds: vi.fn(),
  updateAlertThreshold: vi.fn(),
  deleteAlertThreshold: vi.fn(),
  listAlertEvents: vi.fn(),
  acknowledgeAlertEvent: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
};

vi.mock('../src/modules/observability/repository.js', () => mockRepo);
vi.mock('../src/app/container.js', () => ({ db: {} }));

const service = await import('../src/modules/observability/service.js');

const ORG = 'org-1';

beforeEach(() => vi.clearAllMocks());

// ============================================================================
// recordMetric — exercises checkThresholds() side path
// ============================================================================

describe('recordMetric', () => {
  it('inserts the metric and returns when no active thresholds are configured', async () => {
    mockRepo.findActiveThresholdsForMetric.mockResolvedValue([]);
    await service.recordMetric('cpu_utilization', 50, 'percent');
    expect(mockRepo.insertMetric).toHaveBeenCalledWith({
      metricName: 'cpu_utilization',
      value: 50,
      unit: 'percent',
    });
    expect(mockRepo.createAlertEvent).not.toHaveBeenCalled();
    expect(mockRepo.createNotification).not.toHaveBeenCalled();
  });

  it('passes orgId through to insertMetric when supplied', async () => {
    mockRepo.findActiveThresholdsForMetric.mockResolvedValue([]);
    await service.recordMetric('cpu_utilization', 50, 'percent', ORG);
    expect(mockRepo.insertMetric).toHaveBeenCalledWith({
      metricName: 'cpu_utilization',
      value: 50,
      unit: 'percent',
      orgId: ORG,
    });
  });

  it('does NOT trigger alert when the value does not satisfy the operator', async () => {
    mockRepo.findActiveThresholdsForMetric.mockResolvedValue([
      { id: 't1', operator: 'gt', thresholdValue: 90, orgId: null },
    ]);
    await service.recordMetric('cpu_utilization', 50, 'percent');
    expect(mockRepo.createAlertEvent).not.toHaveBeenCalled();
    expect(mockRepo.createNotification).not.toHaveBeenCalled();
  });

  it('creates a single banner notification when a non-error_rate threshold is triggered', async () => {
    mockRepo.findActiveThresholdsForMetric.mockResolvedValue([
      { id: 't1', operator: 'gt', thresholdValue: 80, orgId: null },
    ]);
    mockRepo.createAlertEvent.mockResolvedValue({ id: 'evt-1' });

    await service.recordMetric('cpu_utilization', 95, 'percent');
    expect(mockRepo.createAlertEvent).toHaveBeenCalledWith('t1', 95, undefined);
    expect(mockRepo.createNotification).toHaveBeenCalledTimes(1);
    expect(mockRepo.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        alertEventId: 'evt-1',
        type: 'banner',
        message: expect.stringContaining('cpu_utilization gt 80'),
      }),
    );
  });

  it('creates BOTH banner AND audible notifications for triggered error_rate threshold', async () => {
    mockRepo.findActiveThresholdsForMetric.mockResolvedValue([
      { id: 't1', operator: 'gte', thresholdValue: 0.05, orgId: null },
    ]);
    mockRepo.createAlertEvent.mockResolvedValue({ id: 'evt-1' });

    await service.recordMetric('error_rate', 0.1, 'percent');
    expect(mockRepo.createNotification).toHaveBeenCalledTimes(2);
    const types = mockRepo.createNotification.mock.calls.map((c: any[]) => c[0].type);
    expect(types).toContain('banner');
    expect(types).toContain('audible');
  });

  it('forwards threshold orgId to createAlertEvent and createNotification', async () => {
    mockRepo.findActiveThresholdsForMetric.mockResolvedValue([
      { id: 't1', operator: 'gt', thresholdValue: 80, orgId: ORG },
    ]);
    mockRepo.createAlertEvent.mockResolvedValue({ id: 'evt-1' });

    await service.recordMetric('cpu_utilization', 95, 'percent');
    expect(mockRepo.createAlertEvent).toHaveBeenCalledWith('t1', 95, ORG);
    expect(mockRepo.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG }),
    );
  });

  it('iterates all matching thresholds independently', async () => {
    mockRepo.findActiveThresholdsForMetric.mockResolvedValue([
      { id: 't1', operator: 'gt', thresholdValue: 80, orgId: null },  // triggers
      { id: 't2', operator: 'gt', thresholdValue: 99, orgId: null },  // does not
      { id: 't3', operator: 'gte', thresholdValue: 95, orgId: null }, // triggers
    ]);
    mockRepo.createAlertEvent
      .mockResolvedValueOnce({ id: 'evt-1' })
      .mockResolvedValueOnce({ id: 'evt-3' });

    await service.recordMetric('cpu_utilization', 95, 'percent');
    expect(mockRepo.createAlertEvent).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// getMetricsSummary
// ============================================================================

describe('getMetricsSummary', () => {
  it('returns null fields when no metrics are recorded', async () => {
    mockRepo.getLatestMetrics.mockResolvedValue([]);
    const summary = await service.getMetricsSummary();
    expect(summary).toEqual({
      p95Latency: null,
      cpuUtilization: null,
      gpuUtilization: null,
      errorRate: null,
      collectedAt: null,
    });
  });

  it('maps each metric name to the correct summary field', async () => {
    mockRepo.getLatestMetrics.mockResolvedValue([
      { metricName: 'p95_latency', value: 250, collectedAt: new Date('2026-04-15T10:00:00Z') },
      { metricName: 'cpu_utilization', value: 60, collectedAt: new Date('2026-04-15T10:01:00Z') },
      { metricName: 'gpu_utilization', value: 30, collectedAt: new Date('2026-04-15T10:02:00Z') },
      { metricName: 'error_rate', value: 0.01, collectedAt: new Date('2026-04-15T10:03:00Z') },
    ]);

    const summary = await service.getMetricsSummary();
    expect(summary.p95Latency).toBe(250);
    expect(summary.cpuUtilization).toBe(60);
    expect(summary.gpuUtilization).toBe(30);
    expect(summary.errorRate).toBe(0.01);
    // collectedAt is the latest
    expect(summary.collectedAt).toBe('2026-04-15T10:03:00.000Z');
  });

  it('passes orgId through to repository', async () => {
    mockRepo.getLatestMetrics.mockResolvedValue([]);
    await service.getMetricsSummary(ORG);
    expect(mockRepo.getLatestMetrics).toHaveBeenCalledWith(ORG);
  });

  it('ignores unknown metric names without throwing', async () => {
    mockRepo.getLatestMetrics.mockResolvedValue([
      { metricName: 'unknown_metric', value: 42, collectedAt: new Date() },
    ]);
    const summary = await service.getMetricsSummary();
    expect(summary.cpuUtilization).toBeNull();
  });
});

// ============================================================================
// searchLogs
// ============================================================================

describe('searchLogs', () => {
  it('passes pagination defaults (page=1, limit=50) to repo', async () => {
    mockRepo.searchLogs.mockResolvedValue({ logs: [], total: 0 });
    await service.searchLogs({}, ORG);
    expect(mockRepo.searchLogs).toHaveBeenCalledWith({}, 1, 50, ORG);
  });

  it('honors page/limit overrides', async () => {
    mockRepo.searchLogs.mockResolvedValue({ logs: [], total: 0 });
    await service.searchLogs({ page: 3, limit: 25 }, ORG);
    expect(mockRepo.searchLogs).toHaveBeenCalledWith({ page: 3, limit: 25 }, 3, 25, ORG);
  });
});

// ============================================================================
// CRUD helpers
// ============================================================================

describe('createAlertThreshold', () => {
  it('forwards data to repo and includes orgId when provided', async () => {
    mockRepo.createAlertThreshold.mockResolvedValue({ id: 't1' });
    await service.createAlertThreshold(
      { metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 80 },
      ORG,
    );
    expect(mockRepo.createAlertThreshold).toHaveBeenCalledWith({
      metricName: 'cpu_utilization',
      operator: 'gt',
      thresholdValue: 80,
      orgId: ORG,
    });
  });

  it('omits orgId when not provided', async () => {
    mockRepo.createAlertThreshold.mockResolvedValue({ id: 't1' });
    await service.createAlertThreshold({
      metricName: 'cpu_utilization',
      operator: 'gt',
      thresholdValue: 80,
    });
    expect(mockRepo.createAlertThreshold).toHaveBeenCalledWith({
      metricName: 'cpu_utilization',
      operator: 'gt',
      thresholdValue: 80,
    });
  });
});

describe('listAlertThresholds', () => {
  it('forwards orgId to repo', async () => {
    mockRepo.listAlertThresholds.mockResolvedValue([]);
    await service.listAlertThresholds(ORG);
    expect(mockRepo.listAlertThresholds).toHaveBeenCalledWith(ORG);
  });
});

describe('updateAlertThreshold', () => {
  it('forwards id, payload, and orgId', async () => {
    mockRepo.updateAlertThreshold.mockResolvedValue({});
    await service.updateAlertThreshold('t1', { isActive: false }, ORG);
    expect(mockRepo.updateAlertThreshold).toHaveBeenCalledWith('t1', { isActive: false }, ORG);
  });
});

describe('deleteAlertThreshold', () => {
  it('forwards id and orgId', async () => {
    mockRepo.deleteAlertThreshold.mockResolvedValue({});
    await service.deleteAlertThreshold('t1', ORG);
    expect(mockRepo.deleteAlertThreshold).toHaveBeenCalledWith('t1', ORG);
  });
});

// ============================================================================
// listAlertEvents — also exercises the response mapping
// ============================================================================

describe('listAlertEvents', () => {
  it('maps repo rows to AlertEventResponse shape with ISO timestamps', async () => {
    mockRepo.listAlertEvents.mockResolvedValue([
      {
        id: 'evt-1',
        threshold: { metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 80 },
        metricValue: 95,
        triggeredAt: new Date('2026-04-15T10:00:00Z'),
        acknowledgedAt: new Date('2026-04-15T10:05:00Z'),
        acknowledgedByUserId: 'usr-1',
      },
    ]);

    const result = await service.listAlertEvents(true, ORG);
    expect(mockRepo.listAlertEvents).toHaveBeenCalledWith(true, ORG);
    expect(result).toEqual([
      {
        id: 'evt-1',
        metricName: 'cpu_utilization',
        operator: 'gt',
        thresholdValue: 80,
        metricValue: 95,
        triggeredAt: '2026-04-15T10:00:00.000Z',
        acknowledgedAt: '2026-04-15T10:05:00.000Z',
        acknowledgedBy: 'usr-1',
      },
    ]);
  });

  it('keeps acknowledgedAt and acknowledgedBy null for unacknowledged events', async () => {
    mockRepo.listAlertEvents.mockResolvedValue([
      {
        id: 'evt-1',
        threshold: { metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 80 },
        metricValue: 95,
        triggeredAt: new Date('2026-04-15T10:00:00Z'),
        acknowledgedAt: null,
        acknowledgedByUserId: null,
      },
    ]);
    const result = await service.listAlertEvents();
    expect(result[0].acknowledgedAt).toBeNull();
    expect(result[0].acknowledgedBy).toBeNull();
  });

  it('uses default onlyUnacknowledged=false when not specified', async () => {
    mockRepo.listAlertEvents.mockResolvedValue([]);
    await service.listAlertEvents();
    expect(mockRepo.listAlertEvents).toHaveBeenCalledWith(false, undefined);
  });
});

describe('acknowledgeAlertEvent', () => {
  it('forwards id, userId, and orgId to repo', async () => {
    mockRepo.acknowledgeAlertEvent.mockResolvedValue({});
    await service.acknowledgeAlertEvent('evt-1', 'usr-1', ORG);
    expect(mockRepo.acknowledgeAlertEvent).toHaveBeenCalledWith('evt-1', 'usr-1', ORG);
  });
});

describe('listNotifications', () => {
  it('passes unreadOnly + orgId to repo', async () => {
    mockRepo.listNotifications.mockResolvedValue([]);
    await service.listNotifications(true, ORG);
    expect(mockRepo.listNotifications).toHaveBeenCalledWith(true, ORG);
  });

  it('uses default unreadOnly=false when not specified', async () => {
    mockRepo.listNotifications.mockResolvedValue([]);
    await service.listNotifications();
    expect(mockRepo.listNotifications).toHaveBeenCalledWith(false, undefined);
  });
});

describe('markNotificationRead', () => {
  it('forwards id and orgId to repo', async () => {
    mockRepo.markNotificationRead.mockResolvedValue({});
    await service.markNotificationRead('n-1', ORG);
    expect(mockRepo.markNotificationRead).toHaveBeenCalledWith('n-1', ORG);
  });
});
