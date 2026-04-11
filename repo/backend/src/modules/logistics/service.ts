import { NotFoundError, UnprocessableError } from '../../common/errors/app-errors.js';
import { calculateShippingFee, type ShippingFeeCalculationInput } from './types.js';
import * as repo from './repository.js';

// ---- Shipping fee calculation ----

export async function calculateFee(orgId: string, input: ShippingFeeCalculationInput) {
  const template = await repo.findTemplateByRegionAndTier(
    orgId,
    input.regionCode,
    input.tier,
    input.itemCount,
  );

  if (!template) {
    throw new NotFoundError(
      `No active shipping fee template found for region '${input.regionCode}', tier '${input.tier}'`,
    );
  }

  const surcharges = template.surcharges.map((s) => ({
    condition: s.condition,
    surchargeAmount: parseFloat(s.surchargeAmount.toString()),
  }));

  return calculateShippingFee(
    {
      id: template.id,
      baseFee: parseFloat(template.baseFee.toString()),
      baseWeightLb: parseFloat(template.baseWeightLb.toString()),
      perAdditionalLbFee: parseFloat(template.perAdditionalLbFee.toString()),
    },
    surcharges,
    input.weightLb,
    input.applicableSurcharges,
  );
}

// ---- Shipment ----

export async function createShipment(orgId: string, data: {
  warehouseId: string;
  carrierId: string;
  trackingNumber?: string;
  parcels: { description: string; weightLb: number; quantity: number }[];
}) {
  const warehouse = await repo.findWarehouseById(data.warehouseId);
  if (!warehouse || warehouse.orgId !== orgId) {
    throw new NotFoundError('Warehouse not found in this organization');
  }

  const carrier = await repo.findCarrierById(data.carrierId);
  if (!carrier || carrier.orgId !== orgId) {
    throw new NotFoundError('Carrier not found in this organization');
  }

  return repo.createShipment(data);
}

export async function recordTrackingUpdate(
  shipmentId: string,
  status: string,
  location: string | null,
  source: string,
) {
  const shipment = await repo.findShipmentById(shipmentId);
  if (!shipment) throw new NotFoundError('Shipment not found');

  await repo.addTrackingUpdate(shipmentId, status, location, source);

  if (status === 'delivered') {
    await repo.updateShipmentStatus(shipmentId, 'delivered', { deliveredAt: new Date() });
  } else if (status === 'shipped') {
    await repo.updateShipmentStatus(shipmentId, 'shipped', { shippedAt: new Date() });
  } else if (status === 'in_transit') {
    await repo.updateShipmentStatus(shipmentId, 'in_transit');
  }
}

export async function getShipmentWithDetails(id: string) {
  const shipment = await repo.findShipmentById(id);
  if (!shipment) throw new NotFoundError('Shipment not found');
  return shipment;
}
