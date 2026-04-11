import { Router } from 'express';
import { authenticate, enforceSameOrg, requireRole, requirePermission } from '../../common/middleware/auth.middleware.js';
import { validateBody } from '../../common/middleware/validate.js';
import { applyFieldMasking } from '../../common/middleware/field-masking.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import {
  createMemberSchema,
  createCouponSchema,
  walletTopUpSchema,
  walletSpendSchema,
  createFulfillmentSchema,
  createMembershipTierSchema,
} from './schemas.js';
import * as ctrl from './controller.js';

// Org-scoped routes (mounted at /api/orgs/:orgId)
export const membershipsOrgRouter = Router({ mergeParams: true });
membershipsOrgRouter.use(authenticate, enforceSameOrg);

membershipsOrgRouter.post(
  '/membership-tiers',
  requireRole('Administrator'),
  idempotency,
  validateBody(createMembershipTierSchema),
  ctrl.createTierHandler,
);

membershipsOrgRouter.get(
  '/membership-tiers',
  requirePermission('read', 'memberships'),
  ctrl.listTiersHandler,
);

membershipsOrgRouter.get(
  '/members',
  requirePermission('read', 'memberships'),
  applyFieldMasking('member'),
  ctrl.listMembersHandler,
);

membershipsOrgRouter.post(
  '/members',
  requirePermission('write', 'memberships'),
  idempotency,
  validateBody(createMemberSchema),
  ctrl.createMemberHandler,
);

membershipsOrgRouter.post(
  '/coupons',
  requireRole('Administrator', 'OpsManager'),
  idempotency,
  validateBody(createCouponSchema),
  ctrl.createCouponHandler,
);

membershipsOrgRouter.post(
  '/fulfillments',
  requirePermission('write', 'memberships'),
  idempotency,
  validateBody(createFulfillmentSchema),
  ctrl.createFulfillmentHandler,
);

// Member-scoped routes (mounted at /api/members)
export const membershipsRouter = Router();

membershipsRouter.get(
  '/:id',
  authenticate,
  requirePermission('read', 'memberships'),
  applyFieldMasking('member'),
  ctrl.getMemberHandler,
);

membershipsRouter.get(
  '/:id/wallet',
  authenticate,
  requirePermission('read', 'memberships'),
  ctrl.getWalletHandler,
);

membershipsRouter.post(
  '/:id/wallet/topup',
  authenticate,
  requirePermission('write', 'memberships'),
  idempotency,
  validateBody(walletTopUpSchema),
  ctrl.topUpWalletHandler,
);

membershipsRouter.post(
  '/:id/wallet/spend',
  authenticate,
  requirePermission('write', 'memberships'),
  idempotency,
  validateBody(walletSpendSchema),
  ctrl.spendFromWalletHandler,
);

membershipsRouter.get(
  '/fulfillments/:id',
  authenticate,
  requirePermission('read', 'memberships'),
  ctrl.getFulfillmentHandler,
);
