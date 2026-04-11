import { z } from 'zod';
import { AlertOperator, LogLevel } from './types.js';

export const createAlertThresholdSchema = z.object({
  metricName: z.string().min(1).max(100),
  operator: z.nativeEnum(AlertOperator),
  thresholdValue: z.number(),
});

export const ingestMetricSchema = z.object({
  metricName: z.string().min(1).max(100),
  value: z.number().finite(),
  unit: z.string().min(1).max(20),
  orgId: z.string().uuid().optional(),
});

export const updateAlertThresholdSchema = z.object({
  operator: z.nativeEnum(AlertOperator).optional(),
  thresholdValue: z.number().optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const logSearchSchema = z.object({
  level: z.nativeEnum(LogLevel).optional(),
  search: z.string().max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const metricsQuerySchema = z.object({
  metricName: z.string().min(1).max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
