import { Request, Response, NextFunction } from 'express';
import * as service from './service.js';
import { LogLevel, LogSearchRequest } from './types.js';

// ---- Metrics ----

export async function getMetricsSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const isAdmin = req.user!.roles.includes('Administrator');
    const orgId = isAdmin ? undefined : req.user?.orgId;
    const summary = await service.getMetricsSummary(orgId);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}

export async function recordMetric(req: Request, res: Response, next: NextFunction) {
  try {
    const { metricName, value, unit, orgId } = req.body as {
      metricName: string;
      value: number;
      unit: string;
      orgId?: string;
    };
    await service.recordMetric(metricName, value, unit, orgId);
    res.status(202).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
}

// ---- Logs ----

export async function searchLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const filters: LogSearchRequest = {
      level: req.query.level as LogLevel | undefined,
      search: req.query.search as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Math.min(Number(req.query.limit), 200) : 50,
    };
    const orgId = req.user?.orgId;
    const result = await service.searchLogs(filters, orgId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---- Alert thresholds ----

export async function listAlertThresholds(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = req.user?.orgId;
    const thresholds = await service.listAlertThresholds(orgId);
    res.json({ success: true, data: thresholds });
  } catch (err) {
    next(err);
  }
}

export async function createAlertThreshold(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = req.user?.orgId;
    const threshold = await service.createAlertThreshold(req.body, orgId);
    res.status(201).json({ success: true, data: threshold });
  } catch (err) {
    next(err);
  }
}

export async function updateAlertThreshold(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const orgId = req.user?.orgId;
    const threshold = await service.updateAlertThreshold(id, req.body, orgId);
    res.json({ success: true, data: threshold });
  } catch (err) {
    next(err);
  }
}

export async function deleteAlertThreshold(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const orgId = req.user?.orgId;
    await service.deleteAlertThreshold(id, orgId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ---- Alert events ----

export async function listAlertEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const onlyUnacknowledged = req.query.onlyUnacknowledged === 'true';
    const orgId = req.user?.orgId;
    const events = await service.listAlertEvents(onlyUnacknowledged, orgId);
    res.json({ success: true, data: events });
  } catch (err) {
    next(err);
  }
}

export async function acknowledgeAlertEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const orgId = req.user?.orgId;
    await service.acknowledgeAlertEvent(id, userId, orgId);
    res.json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
}

// ---- Notifications ----

export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const orgId = req.user?.orgId;
    const notifications = await service.listNotifications(unreadOnly, orgId);
    res.json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const orgId = req.user?.orgId;
    await service.markNotificationRead(id, orgId);
    res.json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
}
