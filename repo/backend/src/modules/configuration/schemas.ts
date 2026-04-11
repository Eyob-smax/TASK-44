import { z } from 'zod';

export const updateConfigSchema = z.object({
  heartbeatFreshnessSeconds: z.number().int().min(10).max(3600).optional(),
  storedValueEnabled: z.boolean().optional(),
  logRetentionDays: z.number().int().min(1).max(365).optional(),
  parkingEscalationMinutes: z.number().int().min(1).max(1440).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one config field must be provided for update',
});
