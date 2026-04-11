import { Router } from 'express';
import { authenticate, requirePermission, requireRole } from '../../common/middleware/auth.middleware.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import { validateBody, validateQuery } from '../../common/middleware/validate.js';
import { verifySigning } from '../../common/middleware/signing.middleware.js';
import {
  createAlertThresholdSchema,
  ingestMetricSchema,
  updateAlertThresholdSchema,
  logSearchSchema,
  metricsQuerySchema,
} from './schemas.js';
import * as ctrl from './controller.js';

export const observabilityRouter = Router();

// ---- Metrics (ingestion may come from signed internal agents or authenticated users) ----
observabilityRouter.get(
  '/metrics',
  authenticate,
  requirePermission('read', 'observability'),
  ctrl.getMetricsSummary,
);

observabilityRouter.post(
  '/metrics',
  verifySigning,   // internal agents use HMAC-signed requests
  idempotency,
  validateBody(ingestMetricSchema),
  ctrl.recordMetric,
);

// ---- Logs ----
observabilityRouter.get(
  '/logs',
  authenticate,
  requirePermission('read', 'observability'),
  validateQuery(logSearchSchema),
  ctrl.searchLogs,
);

// ---- Alert thresholds ----
observabilityRouter.get(
  '/thresholds',
  authenticate,
  requirePermission('read', 'observability'),
  ctrl.listAlertThresholds,
);

observabilityRouter.post(
  '/thresholds',
  authenticate,
  requireRole('Administrator', 'OpsManager'),
  idempotency,
  validateBody(createAlertThresholdSchema),
  ctrl.createAlertThreshold,
);

observabilityRouter.patch(
  '/thresholds/:id',
  authenticate,
  requireRole('Administrator', 'OpsManager'),
  idempotency,
  validateBody(updateAlertThresholdSchema),
  ctrl.updateAlertThreshold,
);

observabilityRouter.delete(
  '/thresholds/:id',
  authenticate,
  requireRole('Administrator'),
  ctrl.deleteAlertThreshold,
);

// ---- Alert events ----
observabilityRouter.get(
  '/alerts',
  authenticate,
  requirePermission('read', 'observability'),
  ctrl.listAlertEvents,
);

observabilityRouter.post(
  '/alerts/:id/acknowledge',
  authenticate,
  requirePermission('write', 'observability'),
  idempotency,
  ctrl.acknowledgeAlertEvent,
);

// ---- Notifications ----
observabilityRouter.get(
  '/notifications',
  authenticate,
  requirePermission('read', 'observability'),
  ctrl.listNotifications,
);

observabilityRouter.post(
  '/notifications/:id/read',
  authenticate,
  requirePermission('write', 'observability'),
  idempotency,
  ctrl.markNotificationRead,
);
