// Observability Domain Types

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export enum AlertOperator {
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  EQ = 'eq',
}

export enum NotificationType {
  BANNER = 'banner',
  AUDIBLE = 'audible',
}

export enum MetricName {
  P95_LATENCY = 'p95_latency',
  CPU_UTILIZATION = 'cpu_utilization',
  GPU_UTILIZATION = 'gpu_utilization',
  ERROR_RATE = 'error_rate',
}

export enum MetricUnit {
  MILLISECONDS = 'ms',
  PERCENT = 'percent',
  COUNT = 'count',
}

/** Log retention period: 30 days */
export const LOG_RETENTION_DAYS = 30;

export interface RuntimeMetric {
  id: string;
  metricName: MetricName;
  value: number;
  unit: MetricUnit;
  collectedAt: Date;
}

export interface ApplicationLog {
  id: string;
  level: LogLevel;
  message: string;
  context: string | null; // JSON
  timestamp: Date;
}

export interface AlertThreshold {
  id: string;
  metricName: string;
  operator: AlertOperator;
  thresholdValue: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertEvent {
  id: string;
  thresholdId: string;
  metricValue: number;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
}

export interface NotificationEvent {
  id: string;
  alertEventId: string | null;
  type: NotificationType;
  message: string;
  targetRoleId: string | null;
  createdAt: Date;
  readAt: Date | null;
}

// --- Request DTOs ---

export interface CreateAlertThresholdRequest {
  metricName: string;
  operator: AlertOperator;
  thresholdValue: number;
}

export interface LogSearchRequest {
  level?: LogLevel;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

// --- Response DTOs ---

export interface MetricsSummaryResponse {
  p95Latency: number | null;
  cpuUtilization: number | null;
  gpuUtilization: number | null;
  errorRate: number | null;
  collectedAt: string | null;
}

export interface AlertEventResponse {
  id: string;
  metricName: string;
  operator: AlertOperator;
  thresholdValue: number;
  metricValue: number;
  triggeredAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

/**
 * Evaluates whether a metric value triggers an alert based on operator and threshold.
 */
export function evaluateThreshold(
  metricValue: number,
  operator: AlertOperator,
  thresholdValue: number
): boolean {
  switch (operator) {
    case AlertOperator.GT:
      return metricValue > thresholdValue;
    case AlertOperator.GTE:
      return metricValue >= thresholdValue;
    case AlertOperator.LT:
      return metricValue < thresholdValue;
    case AlertOperator.LTE:
      return metricValue <= thresholdValue;
    case AlertOperator.EQ:
      return metricValue === thresholdValue;
  }
}
