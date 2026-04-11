import { z } from 'zod';
import { CarrierConnectorType, ShippingTier } from './types.js';

function isLanHostname(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const h = parsed.hostname;
  if (h === 'localhost') return true;
  if (/\.(lan|local|internal|intranet)$/i.test(h)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
  return false;
}

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
});

export const createCarrierSchema = z
  .object({
    name: z.string().min(1).max(200),
    connectorType: z.nativeEnum(CarrierConnectorType),
    connectorConfig: z.string().max(10000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.connectorType === CarrierConnectorType.REST_API && data.connectorConfig) {
      let cfg: { apiUrl?: string };
      try {
        cfg = JSON.parse(data.connectorConfig) as { apiUrl?: string };
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'connectorConfig must be valid JSON',
          path: ['connectorConfig'],
        });
        return;
      }
      if (cfg.apiUrl && !isLanHostname(cfg.apiUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'REST connector apiUrl must be a LAN-local endpoint (private IP or .lan/.local/.internal/.intranet hostname)',
          path: ['connectorConfig'],
        });
      }
    }
  });

export const createShippingFeeTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  baseFee: z.number().gt(0).max(999999.99),
  baseWeightLb: z.number().gt(0).max(9999.99),
  perAdditionalLbFee: z.number().min(0).max(999999.99),
  regionCode: z.string().min(1).max(20),
  tier: z.nativeEnum(ShippingTier),
  minItems: z.number().int().min(1).default(1),
  maxItems: z.number().int().min(1).nullable().optional(),
  surcharges: z.array(z.object({
    condition: z.string().min(1).max(50),
    surchargeAmount: z.number().gt(0).max(999999.99),
  })).optional(),
});

export const createDeliveryZoneSchema = z.object({
  name: z.string().min(1).max(100),
  regionCode: z.string().min(1).max(20),
  zipPatterns: z.array(z.string().min(1).max(10)).min(1),
});

export const addNonServiceableZipSchema = z.object({
  zipCode: z.string().regex(/^\d{5}$/, 'ZIP code must be exactly 5 digits'),
  reason: z.string().max(500).optional(),
});

export const createShipmentSchema = z.object({
  orgId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  carrierId: z.string().uuid(),
  trackingNumber: z.string().max(100).optional(),
  parcels: z.array(z.object({
    description: z.string().min(1).max(500),
    weightLb: z.number().gt(0).max(9999.99),
    quantity: z.number().int().min(1).default(1),
  })).min(1),
});
