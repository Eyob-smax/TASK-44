import { Router } from 'express';
import { authenticate, requireRole } from '../../common/middleware/auth.middleware.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import * as ctrl from './controller.js';

export const backupsRouter = Router();

// List all backup records — Admins, OpsManagers, Auditors can view
backupsRouter.get('/', authenticate, requireRole('Administrator', 'OpsManager', 'Auditor'), ctrl.listBackups);

// Trigger a new backup — Administrators only
backupsRouter.post('/', authenticate, requireRole('Administrator'), idempotency, ctrl.triggerBackup);

// List all restore runs — fixed route must come before parameterized /:id
backupsRouter.get('/restore-runs/all', authenticate, requireRole('Administrator', 'OpsManager', 'Auditor'), ctrl.listRestoreRuns);

// Get a single backup with its restore history
backupsRouter.get('/:id', authenticate, requireRole('Administrator', 'OpsManager', 'Auditor'), ctrl.getBackup);

// Trigger a restore from a backup — Administrators only
backupsRouter.post('/:id/restore', authenticate, requireRole('Administrator'), idempotency, ctrl.triggerRestore);
