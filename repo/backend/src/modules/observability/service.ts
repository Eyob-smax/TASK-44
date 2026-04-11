import * as repo from './repository.js';
import { evaluateThreshold, MetricName, NotificationType } from './types.js';
import type { LogSearchRequest, MetricsSummaryResponse } from './types.js';

// ---- Metrics ----

export async function recordMetric(
  metricName: string,
  value: number,
  unit: string,
  orgId?: string,
): Promise<void> {
  await repo.insertMetric({ metricName, value, unit, ...(orgId ? { orgId } : {}) });
  await checkThresholds(metricName, value);
}

export async function getMetricsSummary(orgId?: string): Promise<MetricsSummaryResponse> {
  const metrics = await repo.getLatestMetrics(orgId);
  const byName: Record<string, number> = {};
  let latestCollectedAt: Date | null = null;

  for (const m of metrics) {
    byName[m.metricName] = m.value;
    if (!latestCollectedAt || m.collectedAt > latestCollectedAt) {
      latestCollectedAt = m.collectedAt;
    }
  }

  return {
    p95Latency: byName[MetricName.P95_LATENCY] ?? null,
    cpuUtilization: byName[MetricName.CPU_UTILIZATION] ?? null,
    gpuUtilization: byName[MetricName.GPU_UTILIZATION] ?? null,
    errorRate: byName[MetricName.ERROR_RATE] ?? null,
    collectedAt: latestCollectedAt?.toISOString() ?? null,
  };
}

// ---- Threshold evaluation (called on each metric ingestion) ----

async function checkThresholds(metricName: string, value: number): Promise<void> {
  const thresholds = await repo.findActiveThresholdsForMetric(metricName);
  for (const threshold of thresholds) {
    const triggered = evaluateThreshold(value, threshold.operator as any, threshold.thresholdValue);
    if (!triggered) continue;

    const orgId = threshold.orgId ?? undefined;
    const event = await repo.createAlertEvent(threshold.id, value, orgId);
    await repo.createNotification({
      alertEventId: event.id,
      type: NotificationType.BANNER,
      message: `Alert: ${metricName} ${threshold.operator} ${threshold.thresholdValue} (actual: ${value})`,
      orgId,
    });

    // Critical alerts also emit an audible notification for workstation awareness.
    if (metricName === MetricName.ERROR_RATE) {
      await repo.createNotification({
        alertEventId: event.id,
        type: NotificationType.AUDIBLE,
        message: `Audible alert: ${metricName} ${threshold.operator} ${threshold.thresholdValue} (actual: ${value})`,
        orgId,
      });
    }
  }
}

// ---- Logs ----

export async function searchLogs(filters: LogSearchRequest, orgId?: string) {
  return repo.searchLogs(filters, filters.page ?? 1, filters.limit ?? 50, orgId);
}

// ---- Alert thresholds ----

export async function createAlertThreshold(
  data: { metricName: string; operator: string; thresholdValue: number },
  orgId?: string,
) {
  return repo.createAlertThreshold({ ...data, ...(orgId ? { orgId } : {}) });
}

export async function listAlertThresholds(orgId?: string) {
  return repo.listAlertThresholds(orgId);
}

export async function updateAlertThreshold(
  id: string,
  data: { operator?: string; thresholdValue?: number; isActive?: boolean },
  orgId?: string,
) {
  return repo.updateAlertThreshold(id, data, orgId);
}

export async function deleteAlertThreshold(id: string, orgId?: string) {
  return repo.deleteAlertThreshold(id, orgId);
}

// ---- Alert events ----

export async function listAlertEvents(onlyUnacknowledged = false, orgId?: string) {
  const events = await repo.listAlertEvents(onlyUnacknowledged, orgId);
  return events.map((e) => ({
    id: e.id,
    metricName: e.threshold.metricName,
    operator: e.threshold.operator,
    thresholdValue: e.threshold.thresholdValue,
    metricValue: e.metricValue,
    triggeredAt: e.triggeredAt.toISOString(),
    acknowledgedAt: e.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: e.acknowledgedByUserId ?? null,
  }));
}

export async function acknowledgeAlertEvent(id: string, userId: string, orgId?: string) {
  return repo.acknowledgeAlertEvent(id, userId, orgId);
}

// ---- Notifications ----

export async function listNotifications(unreadOnly = false, orgId?: string) {
  return repo.listNotifications(unreadOnly, orgId);
}

export async function markNotificationRead(id: string, orgId?: string) {
  return repo.markNotificationRead(id, orgId);
}
