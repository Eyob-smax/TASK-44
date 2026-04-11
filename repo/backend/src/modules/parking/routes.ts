import { Router } from 'express';
import { authenticate, requireRole, requirePermission } from '../../common/middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../../common/middleware/validate.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import {
  ingestParkingEventSchema,
  resolveExceptionSchema,
  escalateExceptionSchema,
  parkingExceptionFilterSchema,
} from './schemas.js';
import * as ctrl from './controller.js';

export const parkingRouter = Router();

parkingRouter.post(
  '/events',
  authenticate,
  requirePermission('write', 'parking'),
  idempotency,
  validateBody(ingestParkingEventSchema),
  ctrl.ingestParkingEventHandler,
);

parkingRouter.get(
  '/facilities',
  authenticate,
  requirePermission('read', 'parking'),
  ctrl.listFacilitiesHandler,
);

parkingRouter.get(
  '/facilities/:id/status',
  authenticate,
  requirePermission('read', 'parking'),
  ctrl.getFacilityStatusHandler,
);

parkingRouter.get(
  '/exceptions',
  authenticate,
  requirePermission('read', 'parking'),
  validateQuery(parkingExceptionFilterSchema),
  ctrl.listExceptionsHandler,
);

parkingRouter.get(
  '/exceptions/:id',
  authenticate,
  requirePermission('read', 'parking'),
  ctrl.getExceptionHandler,
);

parkingRouter.post(
  '/exceptions/:id/resolve',
  authenticate,
  requirePermission('write', 'parking'),
  idempotency,
  validateBody(resolveExceptionSchema),
  ctrl.resolveExceptionHandler,
);

parkingRouter.post(
  '/exceptions/:id/escalate',
  authenticate,
  requireRole('OpsManager', 'Administrator'),
  idempotency,
  validateBody(escalateExceptionSchema),
  ctrl.escalateExceptionHandler,
);
