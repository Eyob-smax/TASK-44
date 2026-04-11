import { z } from 'zod';
import { TicketType, TicketPriority, CompensationDecision } from './types.js';

export const createTicketSchema = z.object({
  type: z.nativeEnum(TicketType),
  shipmentId: z.string().uuid().optional(),
  parcelId: z.string().uuid().optional(),
  priority: z.nativeEnum(TicketPriority).default(TicketPriority.MEDIUM),
  description: z.string().min(1).max(5000),
});

export const addTimelineEntrySchema = z.object({
  content: z.string().min(1).max(5000),
});

export const approveCompensationSchema = z.object({
  decision: z.nativeEnum(CompensationDecision),
  notes: z.string().max(5000).optional(),
});

export const assignTicketSchema = z.object({
  assignedToUserId: z.string().uuid(),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'investigating', 'pending_approval', 'resolved', 'closed']),
});

export const ticketFilterSchema = z.object({
  type: z.nativeEnum(TicketType).optional(),
  status: z.enum(['open', 'investigating', 'pending_approval', 'resolved', 'closed']).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assignedToUserId: z.string().uuid().optional(),
});
