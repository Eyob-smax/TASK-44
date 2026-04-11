import { get, post, patch, del } from './api-client.js';

// ---- Metrics ----

export interface MetricsSummary {
  p95Latency: number | null;
  cpuUtilization: number | null;
  gpuUtilization: number | null;
  errorRate: number | null;
  collectedAt: string | null;
}

// ---- Logs ----

export interface ApplicationLogEntry {
  id: string;
  level: string;
  message: string;
  context: string | null;
  timestamp: string;
}

export interface LogSearchResult {
  logs: ApplicationLogEntry[];
  total: number;
}

export interface LogSearchParams {
  level?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

// ---- Alert thresholds ----

export interface AlertThreshold {
  id: string;
  metricName: string;
  operator: string;
  thresholdValue: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertThresholdRequest {
  metricName: string;
  operator: string;
  thresholdValue: number;
}

// ---- Alert events ----

export interface AlertEvent {
  id: string;
  metricName: string;
  operator: string;
  thresholdValue: number;
  metricValue: number;
  triggeredAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

// ---- Notifications ----

export interface NotificationEvent {
  id: string;
  alertEventId: string | null;
  type: string;
  message: string;
  targetRoleId: string | null;
  createdAt: string;
  readAt: string | null;
}

export const observabilityService = {
  // Metrics
  async getMetricsSummary(): Promise<MetricsSummary> {
    return get('/observability/metrics');
  },

  // Logs
  async searchLogs(params: LogSearchParams = {}): Promise<LogSearchResult> {
    return get('/observability/logs', params as Record<string, unknown>);
  },

  // Alert thresholds
  async listThresholds(): Promise<AlertThreshold[]> {
    return get('/observability/thresholds');
  },

  async createThreshold(data: CreateAlertThresholdRequest): Promise<AlertThreshold> {
    return post('/observability/thresholds', data);
  },

  async updateThreshold(
    id: string,
    data: { operator?: string; thresholdValue?: number; isActive?: boolean },
  ): Promise<AlertThreshold> {
    return patch(`/observability/thresholds/${id}`, data);
  },

  async deleteThreshold(id: string): Promise<void> {
    return del(`/observability/thresholds/${id}`);
  },

  // Alert events
  async listAlertEvents(onlyUnacknowledged = false): Promise<AlertEvent[]> {
    return get('/observability/alerts', { onlyUnacknowledged });
  },

  async acknowledgeAlert(id: string): Promise<void> {
    return post(`/observability/alerts/${id}/acknowledge`);
  },

  // Notifications
  async listNotifications(unreadOnly = false): Promise<NotificationEvent[]> {
    return get('/observability/notifications', { unreadOnly });
  },

  async markNotificationRead(id: string): Promise<void> {
    return post(`/observability/notifications/${id}/read`);
  },
};
