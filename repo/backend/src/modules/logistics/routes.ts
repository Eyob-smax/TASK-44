import { Router } from 'express';
import { authenticate, enforceSameOrg, requireRole, requirePermission } from '../../common/middleware/auth.middleware.js';
import { validateBody } from '../../common/middleware/validate.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import {
  createWarehouseSchema,
  createCarrierSchema,
  createShippingFeeTemplateSchema,
  createDeliveryZoneSchema,
  addNonServiceableZipSchema,
  createShipmentSchema,
} from './schemas.js';
import * as ctrl from './controller.js';

export const logisticsOrgRouter = Router({ mergeParams: true });
export const logisticsShipmentRouter = Router();

// Org-scoped routes (mounted at /api/orgs/:orgId)
logisticsOrgRouter.use(authenticate, enforceSameOrg);

logisticsOrgRouter.get('/warehouses', requirePermission('read', 'logistics'), ctrl.listWarehousesHandler);
logisticsOrgRouter.post('/warehouses', requirePermission('write', 'logistics'), idempotency, validateBody(createWarehouseSchema), ctrl.createWarehouseHandler);

logisticsOrgRouter.get('/carriers', requirePermission('read', 'logistics'), ctrl.listCarriersHandler);
logisticsOrgRouter.post('/carriers', requireRole('Administrator'), idempotency, validateBody(createCarrierSchema), ctrl.createCarrierHandler);

logisticsOrgRouter.get('/shipping-fee-templates', requirePermission('read', 'logistics'), ctrl.listShippingFeeTemplatesHandler);
logisticsOrgRouter.post('/shipping-fee-templates', requireRole('Administrator', 'OpsManager'), idempotency, validateBody(createShippingFeeTemplateSchema), ctrl.createShippingFeeTemplateHandler);
logisticsOrgRouter.get('/shipping-fee-templates/calculate', requirePermission('read', 'logistics'), ctrl.calculateShippingFeeHandler);

logisticsOrgRouter.post('/delivery-zones', requireRole('Administrator'), idempotency, validateBody(createDeliveryZoneSchema), ctrl.createDeliveryZoneHandler);

logisticsOrgRouter.post('/non-serviceable-zips', requireRole('Administrator'), idempotency, validateBody(addNonServiceableZipSchema), ctrl.addNonServiceableZipHandler);

logisticsOrgRouter.get('/shipments', requirePermission('read', 'logistics'), ctrl.listShipmentsHandler);

// Shipment routes (mounted at /api/shipments)
logisticsShipmentRouter.post('/', authenticate, requirePermission('write', 'logistics'), idempotency, validateBody(createShipmentSchema), ctrl.createShipmentHandler);
logisticsShipmentRouter.get('/:id', authenticate, requirePermission('read', 'logistics'), ctrl.getShipmentHandler);
logisticsShipmentRouter.post('/:id/tracking', authenticate, requirePermission('write', 'logistics'), idempotency, ctrl.addTrackingUpdateHandler);
