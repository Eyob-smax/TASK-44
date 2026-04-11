import { db } from '../../app/container.js';
import { encrypt, decrypt } from '../../common/encryption/aes256.js';
import { NotFoundError } from '../../common/errors/app-errors.js';
import type {
  CreateWarehouseRequest,
  CreateCarrierRequest,
  CreateShippingFeeTemplateRequest,
  CreateDeliveryZoneRequest,
  CreateShipmentRequest,
} from './types.js';

// ---- Warehouses ----

export async function createWarehouse(orgId: string, data: CreateWarehouseRequest) {
  return db.warehouse.create({
    data: { orgId, name: data.name, address: data.address ?? null },
  });
}

export async function findWarehouseById(id: string) {
  return db.warehouse.findUnique({ where: { id } });
}

export async function listWarehouses(orgId: string) {
  return db.warehouse.findMany({ where: { orgId, isActive: true }, orderBy: { name: 'asc' } });
}

// ---- Carriers ----

export async function createCarrier(orgId: string, data: CreateCarrierRequest) {
  const encryptedConfig = data.connectorConfig ? encrypt(data.connectorConfig) : null;
  return db.carrier.create({
    data: {
      orgId,
      name: data.name,
      connectorType: data.connectorType,
      connectorConfig: encryptedConfig,
    },
  });
}

export async function findCarrierById(id: string) {
  const carrier = await db.carrier.findUnique({ where: { id } });
  if (!carrier) return null;

  return {
    ...carrier,
    connectorConfig: carrier.connectorConfig ? decrypt(carrier.connectorConfig) : null,
  };
}

export async function listCarriers(orgId: string) {
  const carriers = await db.carrier.findMany({
    where: { orgId, isActive: true },
    select: {
      id: true,
      orgId: true,
      name: true,
      connectorType: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      // connectorConfig intentionally excluded from list
    },
    orderBy: { name: 'asc' },
  });
  return carriers;
}

// ---- Delivery zones ----

export async function createDeliveryZone(orgId: string, data: CreateDeliveryZoneRequest) {
  return db.deliveryZone.create({
    data: {
      orgId,
      name: data.name,
      regionCode: data.regionCode,
      zipPatterns: JSON.stringify(data.zipPatterns),
    },
  });
}

export async function listDeliveryZones(orgId: string) {
  return db.deliveryZone.findMany({ where: { orgId } });
}

// ---- Non-serviceable ZIPs ----

export async function addNonServiceableZip(orgId: string, data: { zipCode: string; reason?: string }) {
  return db.nonServiceableZip.upsert({
    where: { orgId_zipCode: { orgId, zipCode: data.zipCode } },
    update: { reason: data.reason ?? null },
    create: { orgId, zipCode: data.zipCode, reason: data.reason ?? null },
  });
}

export async function isZipServiceable(orgId: string, zipCode: string): Promise<boolean> {
  const record = await db.nonServiceableZip.findUnique({
    where: { orgId_zipCode: { orgId, zipCode } },
  });
  return !record;
}

// ---- Shipping fee templates ----

export async function createShippingFeeTemplate(orgId: string, data: CreateShippingFeeTemplateRequest) {
  return db.$transaction(async (tx) => {
    const template = await tx.shippingFeeTemplate.create({
      data: {
        orgId,
        name: data.name,
        baseFee: data.baseFee,
        baseWeightLb: data.baseWeightLb,
        perAdditionalLbFee: data.perAdditionalLbFee,
        regionCode: data.regionCode,
        tier: data.tier,
        minItems: data.minItems ?? 1,
        maxItems: data.maxItems ?? null,
      },
    });

    if (data.surcharges && data.surcharges.length > 0) {
      await tx.shippingFeeSurcharge.createMany({
        data: data.surcharges.map((s) => ({
          templateId: template.id,
          condition: s.condition,
          surchargeAmount: s.surchargeAmount,
        })),
      });
    }

    return tx.shippingFeeTemplate.findUnique({
      where: { id: template.id },
      include: { surcharges: true },
    });
  });
}

export async function findTemplateByRegionAndTier(
  orgId: string,
  regionCode: string,
  tier: string,
  itemCount: number,
) {
  return db.shippingFeeTemplate.findFirst({
    where: {
      orgId,
      regionCode,
      tier,
      isActive: true,
      minItems: { lte: itemCount },
      OR: [{ maxItems: null }, { maxItems: { gte: itemCount } }],
    },
    include: { surcharges: true },
  });
}

export async function listShippingFeeTemplates(orgId: string) {
  return db.shippingFeeTemplate.findMany({
    where: { orgId, isActive: true },
    include: { surcharges: true },
    orderBy: { name: 'asc' },
  });
}

// ---- Shipments ----

export async function createShipment(data: {
  warehouseId: string;
  carrierId: string;
  trackingNumber?: string;
  parcels: { description: string; weightLb: number; quantity: number }[];
}) {
  return db.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        warehouseId: data.warehouseId,
        carrierId: data.carrierId,
        trackingNumber: data.trackingNumber ?? null,
        status: 'pending',
      },
    });

    await tx.parcel.createMany({
      data: data.parcels.map((p) => ({
        shipmentId: shipment.id,
        description: p.description,
        weightLb: p.weightLb,
        quantity: p.quantity,
        status: 'pending',
      })),
    });

    return tx.shipment.findUnique({
      where: { id: shipment.id },
      include: { parcels: true },
    });
  });
}

export async function listShipments(
  orgId: string,
  filters: { status?: string },
  pagination: { page: number; limit: number },
) {
  const where = {
    warehouse: { orgId },
    ...(filters.status ? { status: filters.status } : {}),
  };
  const skip = (pagination.page - 1) * pagination.limit;
  const [items, total] = await Promise.all([
    db.shipment.findMany({
      where,
      include: { parcels: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pagination.limit,
    }),
    db.shipment.count({ where }),
  ]);
  return { items, total };
}

export async function findShipmentById(id: string) {
  return db.shipment.findUnique({
    where: { id },
    include: {
      parcels: true,
      trackingUpdates: { orderBy: { timestamp: 'desc' } },
      warehouse: { select: { orgId: true } },
    },
  });
}

export async function updateShipmentStatus(
  id: string,
  status: string,
  extra?: { deliveredAt?: Date; shippedAt?: Date; estimatedDeliveryAt?: Date },
) {
  return db.shipment.update({
    where: { id },
    data: { status, ...extra },
  });
}

export async function addTrackingUpdate(
  shipmentId: string,
  status: string,
  location: string | null,
  source: string,
) {
  return db.trackingUpdate.create({
    data: { shipmentId, status, location, timestamp: new Date(), source },
  });
}

// ---- Carrier sync cursors ----

export async function upsertSyncCursor(
  carrierId: string,
  data: { lastSyncAt?: Date; lastSuccessCursor?: string; errorState?: string | null },
) {
  return db.carrierSyncCursor.upsert({
    where: { carrierId },
    update: { ...data },
    create: { carrierId, ...data },
  });
}

export async function findSyncCursorByCarrier(carrierId: string) {
  return db.carrierSyncCursor.findUnique({ where: { carrierId } });
}
