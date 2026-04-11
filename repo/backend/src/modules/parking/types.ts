// Parking Operations Domain Types

export enum ParkingReaderType {
  ENTRY = 'entry',
  EXIT = 'exit',
}

export enum ParkingEventType {
  ENTRY = 'entry',
  EXIT = 'exit',
}

export enum ParkingSessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXCEPTION = 'exception',
}

export enum ParkingExceptionType {
  NO_PLATE = 'no_plate',
  OVERTIME = 'overtime',
  UNSETTLED = 'unsettled',
  DUPLICATE_PLATE = 'duplicate_plate',
  INCONSISTENT_ENTRY_EXIT = 'inconsistent_entry_exit',
}

export enum ParkingExceptionStatus {
  OPEN = 'open',
  ESCALATED = 'escalated',
  RESOLVED = 'resolved',
}

/** 15-minute escalation threshold in milliseconds */
export const ESCALATION_THRESHOLD_MS = 15 * 60 * 1000;

export interface ParkingFacility {
  id: string;
  campusId: string;
  name: string;
  totalSpaces: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParkingSpace {
  id: string;
  facilityId: string;
  label: string;
  isActive: boolean;
}

export interface ParkingReader {
  id: string;
  facilityId: string;
  type: ParkingReaderType;
  location: string;
}

export interface ParkingEvent {
  id: string;
  readerId: string;
  plateNumber: string | null;
  eventType: ParkingEventType;
  capturedAt: Date;
  imageAssetId: string | null;
}

export interface ParkingSession {
  id: string;
  facilityId: string;
  plateNumber: string;
  entryEventId: string;
  exitEventId: string | null;
  entryAt: Date;
  exitAt: Date | null;
  status: ParkingSessionStatus;
}

export interface ParkingException {
  id: string;
  facilityId: string;
  type: ParkingExceptionType;
  relatedSessionId: string | null;
  relatedEventId: string | null;
  status: ParkingExceptionStatus;
  description: string | null;
  createdAt: Date;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  resolutionNote: string | null; // required for closure
}

export interface ParkingEscalation {
  id: string;
  exceptionId: string;
  escalatedToUserId: string;
  escalatedAt: Date;
  acknowledgedAt: Date | null;
}

// --- Request DTOs ---

export interface ResolveExceptionRequest {
  resolutionNote: string; // required, non-empty
}

// --- Response DTOs ---

export interface ParkingStatusResponse {
  facilityId: string;
  facilityName: string;
  totalSpaces: number;
  occupiedSpaces: number;
  availableSpaces: number;
  turnoverPerHour: number;
  openExceptions: number;
  escalatedExceptions: number;
}

/**
 * Parking turnover defined as entry events per hour.
 * Values are non-negative and rounded to 2 decimals for API consistency.
 */
export function calculateTurnoverPerHour(entryEventsInLastHour: number): number {
  const safe = Math.max(0, entryEventsInLastHour);
  return parseFloat(safe.toFixed(2));
}

export interface ParkingExceptionResponse {
  id: string;
  facilityName: string;
  type: ParkingExceptionType;
  status: ParkingExceptionStatus;
  description: string | null;
  plateNumber: string | null;
  createdAt: string;
  escalatedAt: string | null;
  minutesSinceCreated: number;
  isEscalationEligible: boolean;
}

/**
 * Determines if a parking exception is eligible for escalation.
 * An exception is eligible if it's still open and was created more than 15 minutes ago.
 */
export function isEscalationEligible(
  exception: Pick<ParkingException, 'status' | 'createdAt'>,
  now: Date = new Date(),
  escalationThresholdMs = ESCALATION_THRESHOLD_MS,
): boolean {
  if (exception.status !== ParkingExceptionStatus.OPEN) return false;
  const elapsed = now.getTime() - exception.createdAt.getTime();
  return elapsed >= escalationThresholdMs;
}
