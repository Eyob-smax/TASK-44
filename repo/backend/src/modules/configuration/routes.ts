import { Router } from 'express';
import { authenticate, requireRole } from '../../common/middleware/auth.middleware.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import { validateBody } from '../../common/middleware/validate.js';
import { updateConfigSchema } from './schemas.js';
import * as ctrl from './controller.js';

export const configRouter = Router();

// Readable by all authenticated users with admin/ops access
configRouter.get(
  '/',
  authenticate,
  requireRole('Administrator', 'OpsManager', 'Auditor'),
  ctrl.getConfig,
);

// Only Administrators can change runtime config
configRouter.patch(
  '/',
  authenticate,
  requireRole('Administrator'),
  idempotency,
  validateBody(updateConfigSchema),
  ctrl.updateConfig,
);
