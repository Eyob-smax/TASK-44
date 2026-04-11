// Logistics Domain Types

export enum CarrierConnectorType {
  REST_API = 'rest_api',
  FILE_DROP = 'file_drop',
  MANUAL = 'manual',
}

export enum ShipmentStatus {
  PENDING = 'pending',
  PICKED = 'picked',
  SHIPPED = 'shipped',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  EXCEPTION = 'exception',
}

export enum ShippingTier {
  STANDARD = 'standard',
  EXPRESS = 'express',
  PRIORITY = 'priority',
}

export enum TrackingSource {
  CARRIER_SYNC = 'carrier_sync',
  MANUAL = 'manual',
}

export interface Warehouse {
  id: string;
  orgId: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Carrier {
  id: string;
  orgId: string;
  name: string;
  connectorType: CarrierConnectorType;
  connectorConfig: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryZone {
  id: string;
  orgId: string;
  name: string;
  regionCode: string;
  zipPatterns: string; // JSON array
}

export interface NonServiceableZip {
  id: string;
  orgId: string;
  zipCode: string;
  reason: string | null;
}

export interface ShippingFeeTemplate {
  id: string;
  orgId: string;
  name: string;
  baseFee: number;
  baseWeightLb: number;
  perAdditionalLbFee: number;
  regionCode: string;
  tier: ShippingTier;
  minItems: number;
  maxItems: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShippingFeeSurcharge {
  id: string;
  templateId: string;
  condition: string;
  surchargeAmount: number;
}

export interface Shipment {
  id: string;
  warehouseId: string;
  carrierId: string;
  trackingNumber: string | null;
  status: ShipmentStatus;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  estimatedDeliveryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Parcel {
  id: string;
  shipmentId: string;
  description: string;
  weightLb: number;
  quantity: number;
  status: string;
}

export interface TrackingUpdate {
  id: string;
  shipmentId: string;
  status: string;
  location: string | null;
  timestamp: Date;
  source: TrackingSource;
}

export interface CarrierSyncCursor {
  id: string;
  carrierId: string;
  lastSyncAt: Date | null;
  lastSuccessCursor: string | null;
  errorState: string | null;
}

// --- Request DTOs ---

export interface CreateWarehouseRequest {
  name: string;
  address?: string;
}

export interface CreateCarrierRequest {
  name: string;
  connectorType: CarrierConnectorType;
  connectorConfig?: string;
}

export interface CreateShippingFeeTemplateRequest {
  name: string;
  baseFee: number;
  baseWeightLb: number;
  perAdditionalLbFee: number;
  regionCode: string;
  tier: ShippingTier;
  minItems?: number;
  maxItems?: number;
  surcharges?: { condition: string; surchargeAmount: number }[];
}

export interface CreateDeliveryZoneRequest {
  name: string;
  regionCode: string;
  zipPatterns: string[];
}

export interface CreateShipmentRequest {
  warehouseId: string;
  carrierId: string;
  trackingNumber?: string;
  parcels: { description: string; weightLb: number; quantity: number }[];
}

// --- Calculation types ---

export interface ShippingFeeCalculationInput {
  weightLb: number;
  itemCount: number;
  regionCode: string;
  tier: ShippingTier;
  applicableSurcharges: string[];
}

export interface ShippingFeeCalculationResult {
  baseFee: number;
  additionalWeightFee: number;
  surchargeTotal: number;
  totalFee: number;
  templateId: string;
  breakdown: {
    label: string;
    amount: number;
  }[];
}

/**
 * Calculates the shipping fee given a template and input parameters.
 * Formula: baseFee + max(0, (weight - baseWeight)) * perAdditionalLbFee + surcharges
 */
export function calculateShippingFee(
  template: Pick<ShippingFeeTemplate, 'id' | 'baseFee' | 'baseWeightLb' | 'perAdditionalLbFee'>,
  surcharges: Pick<ShippingFeeSurcharge, 'condition' | 'surchargeAmount'>[],
  weightLb: number,
  applicableConditions: string[]
): ShippingFeeCalculationResult {
  const baseFee = template.baseFee;
  const overageWeight = Math.max(0, weightLb - template.baseWeightLb);
  const additionalWeightFee = parseFloat((overageWeight * template.perAdditionalLbFee).toFixed(2));

  const applicableSurcharges = surcharges.filter((s) =>
    applicableConditions.includes(s.condition)
  );
  const surchargeTotal = parseFloat(
    applicableSurcharges.reduce((sum, s) => sum + s.surchargeAmount, 0).toFixed(2)
  );

  const totalFee = parseFloat((baseFee + additionalWeightFee + surchargeTotal).toFixed(2));

  const breakdown: { label: string; amount: number }[] = [
    { label: 'Base fee', amount: baseFee },
  ];
  if (additionalWeightFee > 0) {
    breakdown.push({
      label: `Additional weight (${overageWeight.toFixed(2)} lb)`,
      amount: additionalWeightFee,
    });
  }
  for (const s of applicableSurcharges) {
    breakdown.push({ label: `Surcharge: ${s.condition}`, amount: s.surchargeAmount });
  }

  return {
    baseFee,
    additionalWeightFee,
    surchargeTotal,
    totalFee,
    templateId: template.id,
    breakdown,
  };
}
