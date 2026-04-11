import { Router } from 'express';
import { authenticate, enforceSameOrg, requireRole, requirePermission } from '../../common/middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../../common/middleware/validate.js';
import { applyFieldMasking } from '../../common/middleware/field-masking.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import {
  createTicketSchema,
  addTimelineEntrySchema,
  approveCompensationSchema,
  ticketFilterSchema,
  assignTicketSchema,
  updateTicketStatusSchema,
} from './schemas.js';
import * as ctrl from './controller.js';

// Org-scoped ticket routes (mounted at /api/orgs/:orgId)
export const afterSalesOrgRouter = Router({ mergeParams: true });
afterSalesOrgRouter.use(authenticate, enforceSameOrg);

afterSalesOrgRouter.post(
  '/tickets',
  requirePermission('write', 'after-sales'),
  idempotency,
  validateBody(createTicketSchema),
  ctrl.createTicketHandler,
);

afterSalesOrgRouter.get(
  '/tickets',
  requirePermission('read', 'after-sales'),
  validateQuery(ticketFilterSchema),
  applyFieldMasking('ticket'),
  ctrl.listTicketsHandler,
);

// Ticket-scoped routes (mounted at /api/tickets)
export const afterSalesTicketRouter = Router();

afterSalesTicketRouter.get(
  '/:id',
  authenticate,
  requirePermission('read', 'after-sales'),
  applyFieldMasking('ticket'),
  ctrl.getTicketHandler,
);

afterSalesTicketRouter.post(
  '/:id/timeline',
  authenticate,
  requirePermission('write', 'after-sales'),
  idempotency,
  validateBody(addTimelineEntrySchema),
  ctrl.addTimelineEntryHandler,
);

afterSalesTicketRouter.post(
  '/:id/assign',
  authenticate,
  requirePermission('write', 'after-sales'),
  idempotency,
  validateBody(assignTicketSchema),
  ctrl.assignTicketHandler,
);

afterSalesTicketRouter.post(
  '/:id/status',
  authenticate,
  requirePermission('write', 'after-sales'),
  idempotency,
  validateBody(updateTicketStatusSchema),
  ctrl.updateTicketStatusHandler,
);

afterSalesTicketRouter.post(
  '/:id/evidence',
  authenticate,
  requirePermission('write', 'after-sales'),
  idempotency,
  ctrl.addEvidenceHandler,
);

afterSalesTicketRouter.post(
  '/:id/suggest-compensation',
  authenticate,
  requirePermission('write', 'after-sales'),
  idempotency,
  ctrl.suggestCompensationHandler,
);

afterSalesTicketRouter.post(
  '/:id/compensations/:suggestionId/approve',
  authenticate,
  requireRole('OpsManager', 'Administrator'),
  idempotency,
  validateBody(approveCompensationSchema),
  ctrl.approveCompensationHandler,
);
