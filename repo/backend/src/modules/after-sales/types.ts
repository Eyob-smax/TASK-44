// After-Sales Domain Types

export enum TicketType {
  DELAY = 'delay',
  DISPUTE = 'dispute',
  LOST_ITEM = 'lost_item',
}

export enum TicketStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  PENDING_APPROVAL = 'pending_approval',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TimelineEntryType {
  CREATED = 'created',
  ASSIGNED = 'assigned',
  NOTE = 'note',
  STATUS_CHANGE = 'status_change',
  COMPENSATION = 'compensation',
  EVIDENCE_ADDED = 'evidence_added',
  RESOLVED = 'resolved',
}

export enum CompensationDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum CompensationSuggestionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum CompensationTriggerType {
  DELIVERY_LATE_48H = 'delivery_late_48h',
  LOST_ITEM = 'lost_item',
  DAMAGED_ITEM = 'damaged_item',
}

/** Default maximum compensation per ticket: $50.00 */
export const DEFAULT_COMPENSATION_CAP = 50.0;

export interface AfterSalesTicket {
  id: string;
  orgId: string;
  type: TicketType;
  shipmentId: string | null;
  parcelId: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  createdByUserId: string;
  assignedToUserId: string | null;
  slaDeadlineAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketTimeline {
  id: string;
  ticketId: string;
  entryType: TimelineEntryType;
  content: string;
  userId: string;
  createdAt: Date;
}

export interface EvidenceAsset {
  id: string;
  ticketId: string;
  fileAssetId: string;
  description: string | null;
  uploadedByUserId: string;
  uploadedAt: Date;
}

export interface CompensationPolicy {
  id: string;
  orgId: string;
  triggerType: CompensationTriggerType;
  compensationAmount: number;
  maxCapPerTicket: number;
  isActive: boolean;
}

export interface CompensationSuggestion {
  id: string;
  ticketId: string;
  policyId: string;
  suggestedAmount: number;
  reason: string;
  status: CompensationSuggestionStatus;
}

export interface CompensationApproval {
  id: string;
  suggestionId: string;
  approvedByUserId: string;
  decision: CompensationDecision;
  notes: string | null;
  decidedAt: Date;
}

// --- Request DTOs ---

export interface CreateTicketRequest {
  type: TicketType;
  shipmentId?: string;
  parcelId?: string;
  priority?: TicketPriority;
  description: string;
}

export interface AddEvidenceRequest {
  description?: string;
  // File upload handled via multipart
}

export interface ApproveCompensationRequest {
  decision: CompensationDecision;
  notes?: string;
}

// --- Response DTOs ---

export interface TicketResponse {
  id: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  shipmentId: string | null;
  parcelId: string | null;
  createdBy: string;
  assignedTo: string | null;
  slaDeadlineAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  timeline: TimelineEntryResponse[];
  evidence: EvidenceResponse[];
  compensations: CompensationResponse[];
}

export interface TimelineEntryResponse {
  id: string;
  entryType: TimelineEntryType;
  content: string;
  userId: string;
  createdAt: string;
}

export interface EvidenceResponse {
  id: string;
  fileAssetId: string;
  description: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

export interface CompensationResponse {
  id: string;
  suggestedAmount: number;
  reason: string;
  status: CompensationSuggestionStatus;
  approval: {
    decision: CompensationDecision;
    approvedBy: string;
    notes: string | null;
    decidedAt: string;
  } | null;
}

/**
 * Calculates the remaining compensation budget for a ticket,
 * considering already approved suggestions and the per-ticket cap.
 */
export function remainingCompensationBudget(
  approvedTotal: number,
  capPerTicket: number = DEFAULT_COMPENSATION_CAP
): number {
  return Math.max(0, parseFloat((capPerTicket - approvedTotal).toFixed(2)));
}

/**
 * Caps a suggested compensation amount to not exceed the per-ticket maximum.
 */
export function capCompensation(
  suggestedAmount: number,
  approvedTotal: number,
  capPerTicket: number = DEFAULT_COMPENSATION_CAP
): number {
  const remaining = remainingCompensationBudget(approvedTotal, capPerTicket);
  return parseFloat(Math.min(suggestedAmount, remaining).toFixed(2));
}
