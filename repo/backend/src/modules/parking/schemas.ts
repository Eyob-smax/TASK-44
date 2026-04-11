import { z } from 'zod';
import { ParkingExceptionType, ParkingEventType } from './types.js';

export const createParkingFacilitySchema = z.object({
  campusId: z.string().uuid(),
  name: z.string().min(1).max(200),
  totalSpaces: z.number().int().min(1),
});

export const createParkingReaderSchema = z.object({
  facilityId: z.string().uuid(),
  type: z.enum(['entry', 'exit']),
  location: z.string().min(1).max(200),
});

export const ingestParkingEventSchema = z.object({
  readerId: z.string().uuid(),
  plateNumber: z.string().max(20).nullable().optional(),
  eventType: z.nativeEnum(ParkingEventType),
  capturedAt: z.string().datetime().optional(),
  imageAssetId: z.string().uuid().optional(),
});

export const resolveExceptionSchema = z.object({
  resolutionNote: z.string().min(1, 'Resolution note is required for exception closure').max(5000),
});

export const escalateExceptionSchema = z.object({
  escalatedToUserId: z.string().uuid().optional(),
});

export const parkingExceptionFilterSchema = z.object({
  facilityId: z.string().uuid().optional(),
  type: z.nativeEnum(ParkingExceptionType).optional(),
  status: z.enum(['open', 'escalated', 'resolved']).optional(),
});
