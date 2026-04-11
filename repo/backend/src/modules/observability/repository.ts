import { db } from '../../app/container.js';
import { NotFoundError, ForbiddenError } from '../../common/errors/app-errors.js';
import { decrypt } from '../../common/encryption/aes256.js';
import type { LogSearchRequest } from './types.js';

// ---- Metrics ----

export async function insertMetric(data: { metricName: string; value: number; unit: string; orgId?: string }) {
  return db.runtimeMetric.create({ data });
}

export async function getLatestMetrics(orgId?: string) {
  // Most recent value per distinct metric name, scoped to org when provided
  return db.runtimeMetric.findMany({
    where: orgId ? { orgId } : {},
    orderBy: { collectedAt: 'desc' },
    distinct: ['metricName'],
  });
}

export async function getMetricHistory(metricName: string, since: Date, orgId?: string) {
  return db.runtimeMetric.findMany({
    where: { metricName, collectedAt: { gte: since }, ...(orgId ? { orgId } : {}) },
    orderBy: { collectedAt: 'asc' },
  });
}

// ---- Logs ----

export async function searchLogs(filters: LogSearchRequest, page = 1, limit = 50, orgId?: string) {
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};

  if (filters.level) where.level = filters.level;
  if (filters.search) where.messageSearch = { contains: filters.search };
  if (orgId) where.orgId = orgId;

  if (filters.startDate || filters.endDate) {
    const tsFilter: Record<string, Date> = {};
    if (filters.startDate) tsFilter.gte = new Date(filters.startDate);
    if (filters.endDate) tsFilter.lte = new Date(filters.endDate);
    where.timestamp = tsFilter;
  }

  const [rawLogs, total] = await Promise.all([
    db.applicationLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
    }),
    db.applicationLog.count({ where }),
  ]);

  const tryDecrypt = (value: string | null): string | null => {
    if (!value) return null;
    try { return decrypt(value); } catch { return value; }
  };

  const logs = rawLogs.map((log) => ({
    ...log,
    message: tryDecrypt(log.message) ?? log.message,
    context: tryDecrypt(log.context),
  }));

  return { logs, total };
}

// ---- Alert thresholds ----

export async function createAlertThreshold(data: {
  metricName: string;
  operator: string;
  thresholdValue: number;
  orgId?: string;
}) {
  return db.alertThreshold.create({ data });
}

export async function listAlertThresholds(orgId?: string) {
  return db.alertThreshold.findMany({
    where: orgId ? { orgId } : {},
    orderBy: { createdAt: 'desc' },
  });
}

export async function findAlertThresholdById(id: string) {
  return db.alertThreshold.findUnique({ where: { id } });
}

export async function updateAlertThreshold(
  id: string,
  data: { operator?: string; thresholdValue?: number; isActive?: boolean },
  orgId?: string,
) {
  const existing = await findAlertThresholdById(id);
  if (!existing) throw new NotFoundError(`Alert threshold ${id} not found`);
  if (orgId && existing.orgId && existing.orgId !== orgId) {
    throw new NotFoundError(`Alert threshold ${id} not found`);
  }
  return db.alertThreshold.update({ where: { id }, data });
}

export async function deleteAlertThreshold(id: string, orgId?: string) {
  const existing = await findAlertThresholdById(id);
  if (!existing) throw new NotFoundError(`Alert threshold ${id} not found`);
  if (orgId && existing.orgId && existing.orgId !== orgId) {
    throw new NotFoundError(`Alert threshold ${id} not found`);
  }
  return db.alertThreshold.delete({ where: { id } });
}

export async function findActiveThresholdsForMetric(metricName: string) {
  return db.alertThreshold.findMany({ where: { metricName, isActive: true } });
}

// ---- Alert events ----

export async function createAlertEvent(thresholdId: string, metricValue: number, orgId?: string) {
  return db.alertEvent.create({
    data: { thresholdId, metricValue, ...(orgId ? { orgId } : {}) },
    include: { threshold: true },
  });
}

export async function listAlertEvents(onlyUnacknowledged = false, orgId?: string) {
  return db.alertEvent.findMany({
    where: {
      ...(onlyUnacknowledged ? { acknowledgedAt: null } : {}),
      ...(orgId ? { orgId } : {}),
    },
    include: {
      threshold: { select: { metricName: true, operator: true, thresholdValue: true } },
    },
    orderBy: { triggeredAt: 'desc' },
    take: 100,
  });
}

export async function acknowledgeAlertEvent(id: string, userId: string, orgId?: string) {
  const event = await db.alertEvent.findUnique({ where: { id } });
  if (!event) throw new NotFoundError('Alert event not found');
  if (orgId && event.orgId && event.orgId !== orgId) {
    throw new NotFoundError('Alert event not found');
  }
  return db.alertEvent.update({
    where: { id },
    data: { acknowledgedAt: new Date(), acknowledgedByUserId: userId },
  });
}

// ---- Notifications ----

export async function createNotification(data: {
  alertEventId?: string;
  type: string;
  message: string;
  targetRoleId?: string;
  orgId?: string;
}) {
  return db.notificationEvent.create({ data });
}

export async function listNotifications(unreadOnly = false, orgId?: string) {
  return db.notificationEvent.findMany({
    where: {
      ...(unreadOnly ? { readAt: null } : {}),
      ...(orgId ? { orgId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function markNotificationRead(id: string, orgId?: string) {
  const notification = await db.notificationEvent.findUnique({ where: { id } });
  if (!notification) throw new NotFoundError('Notification not found');
  if (orgId && notification.orgId && notification.orgId !== orgId) {
    throw new NotFoundError('Notification not found');
  }
  return db.notificationEvent.update({
    where: { id },
    data: { readAt: new Date() },
  });
}
