import { z } from 'zod';
import { AnomalyType, AnomalySeverity } from './types.js';

export const ingestHeartbeatSchema = z.object({
  classroomId: z.string().uuid(),
  metadata: z.record(z.unknown()).optional(),
});

export const ingestConfidenceSchema = z.object({
  classroomId: z.string().uuid(),
  confidence: z.number().min(0).max(1),
});

export const reportAnomalySchema = z.object({
  classroomId: z.string().uuid(),
  type: z.nativeEnum(AnomalyType),
  severity: z.nativeEnum(AnomalySeverity),
  description: z.string().max(5000).optional(),
});

export const acknowledgeAnomalySchema = z.object({});

export const assignAnomalySchema = z.object({
  assignedToUserId: z.string().uuid(),
});

export const resolveAnomalySchema = z.object({
  resolutionNote: z.string().min(1, 'Resolution note is required').max(5000),
});
