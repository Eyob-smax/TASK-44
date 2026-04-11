import { Router } from 'express';
import { authenticate, requireRole, requirePermission } from '../../common/middleware/auth.middleware.js';
import { validateBody } from '../../common/middleware/validate.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import {
  ingestHeartbeatSchema,
  ingestConfidenceSchema,
  reportAnomalySchema,
  acknowledgeAnomalySchema,
  assignAnomalySchema,
  resolveAnomalySchema,
} from './schemas.js';
import * as ctrl from './controller.js';

export const classroomOpsRouter = Router();

classroomOpsRouter.post(
  '/heartbeat',
  authenticate,
  idempotency,
  validateBody(ingestHeartbeatSchema),
  ctrl.ingestHeartbeatHandler,
);

classroomOpsRouter.post(
  '/confidence',
  authenticate,
  idempotency,
  validateBody(ingestConfidenceSchema),
  ctrl.ingestConfidenceHandler,
);

classroomOpsRouter.post(
  '/anomalies',
  authenticate,
  requireRole('ClassroomSupervisor', 'OpsManager', 'Administrator'),
  idempotency,
  validateBody(reportAnomalySchema),
  ctrl.reportAnomalyHandler,
);

classroomOpsRouter.get(
  '/anomalies',
  authenticate,
  requirePermission('read', 'classroom-ops'),
  ctrl.listAnomaliesHandler,
);

classroomOpsRouter.get(
  '/anomalies/:id',
  authenticate,
  requirePermission('read', 'classroom-ops'),
  ctrl.getAnomalyHandler,
);

classroomOpsRouter.post(
  '/anomalies/:id/acknowledge',
  authenticate,
  requirePermission('write', 'classroom-ops'),
  idempotency,
  ctrl.acknowledgeAnomalyHandler,
);

classroomOpsRouter.post(
  '/anomalies/:id/assign',
  authenticate,
  requirePermission('write', 'classroom-ops'),
  idempotency,
  validateBody(assignAnomalySchema),
  ctrl.assignAnomalyHandler,
);

classroomOpsRouter.post(
  '/anomalies/:id/resolve',
  authenticate,
  requirePermission('write', 'classroom-ops'),
  idempotency,
  validateBody(resolveAnomalySchema),
  ctrl.resolveAnomalyHandler,
);

classroomOpsRouter.get(
  '/dashboard',
  authenticate,
  requirePermission('read', 'classroom-ops'),
  ctrl.getDashboardHandler,
);
