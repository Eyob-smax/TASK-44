import { Request, Response, NextFunction } from 'express';
import { NotFoundError, ValidationError } from '../../common/errors/app-errors.js';
import { ShippingTier } from './types.js';
import * as service from './service.js';
import * as repo from './repository.js';

// ---- Warehouses ----

export async function createWarehouseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const w = await repo.createWarehouse(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: w });
  } catch (err) { next(err); }
}

export async function listWarehousesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const warehouses = await repo.listWarehouses(req.params.orgId);
    res.json({ success: true, data: warehouses });
  } catch (err) { next(err); }
}

// ---- Carriers ----

export async function createCarrierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const carrier = await repo.createCarrier(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: { ...carrier, connectorConfig: undefined } });
  } catch (err) { next(err); }
}

export async function listCarriersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const carriers = await repo.listCarriers(req.params.orgId);
    res.json({ success: true, data: carriers });
  } catch (err) { next(err); }
}

// ---- Shipping fee templates ----

export async function createShippingFeeTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await repo.createShippingFeeTemplate(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: template });
  } catch (err) { next(err); }
}

export async function listShippingFeeTemplatesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const templates = await repo.listShippingFeeTemplates(req.params.orgId);
    res.json({ success: true, data: templates });
  } catch (err) { next(err); }
}

export async function calculateShippingFeeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { regionCode, tier, weightLb, itemCount, surcharges } = req.query as Record<string, string>;
    if (!regionCode || !tier || !weightLb || !itemCount) {
      throw new ValidationError('regionCode, tier, weightLb, itemCount are required', {});
    }
    const result = await service.calculateFee(req.params.orgId, {
      regionCode,
      tier: tier as ShippingTier,
      weightLb: parseFloat(weightLb),
      itemCount: parseInt(itemCount, 10),
      applicableSurcharges: surcharges ? surcharges.split(',') : [],
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ---- Delivery zones ----

export async function createDeliveryZoneHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const zone = await repo.createDeliveryZone(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: zone });
  } catch (err) { next(err); }
}

// ---- Non-serviceable ZIPs ----

export async function addNonServiceableZipHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const zip = await repo.addNonServiceableZip(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: zip });
  } catch (err) { next(err); }
}

// ---- Shipments ----

export async function listShipmentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string ?? '1', 10) || 1;
    const limit = parseInt(req.query['limit'] as string ?? '20', 10) || 20;
    const status = req.query['status'] as string | undefined;
    const result = await repo.listShipments(req.params.orgId, { status }, { page, limit });
    res.json({ success: true, data: { shipments: result.items, total: result.total } });
  } catch (err) { next(err); }
}

export async function createShipmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // orgId comes from validated request body (schema-enforced)
    const { orgId } = req.body as { orgId: string };
    if (req.user!.orgId && req.user!.orgId !== orgId) {
      throw new NotFoundError('Organization not found');
    }
    const shipment = await service.createShipment(orgId, req.body);
    res.status(201).json({ success: true, data: shipment });
  } catch (err) { next(err); }
}

export async function getShipmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await repo.findShipmentById(req.params.id);
    if (!shipment) throw new NotFoundError('Shipment not found');
    if (req.user!.orgId && shipment.warehouse.orgId !== req.user!.orgId) throw new NotFoundError('Shipment not found');
    res.json({ success: true, data: shipment });
  } catch (err) { next(err); }
}

export async function addTrackingUpdateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await repo.findShipmentById(req.params.id);
    if (!shipment) throw new NotFoundError('Shipment not found');
    if (req.user!.orgId && shipment.warehouse.orgId !== req.user!.orgId) throw new NotFoundError('Shipment not found');
    const { status, location, source = 'manual' } = req.body as {
      status: string;
      location?: string;
      source?: string;
    };
    await service.recordTrackingUpdate(req.params.id, status, location ?? null, source);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
}
