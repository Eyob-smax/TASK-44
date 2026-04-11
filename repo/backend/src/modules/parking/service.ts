import { db } from '../../app/container.js';
import { NotFoundError, UnprocessableError } from '../../common/errors/app-errors.js';
import { ParkingExceptionType, ParkingExceptionStatus, isEscalationEligible } from './types.js';
import { getConfig } from '../configuration/service.js';
import * as repo from './repository.js';

const OVERTIME_THRESHOLD_HOURS = 4;
const UNSETTLED_THRESHOLD_MINUTES = 15;

// ---- Event ingestion ----

export async function ingestParkingEvent(data: {
  readerId: string;
  plateNumber?: string | null;
  eventType: string;
  capturedAt?: Date;
  imageAssetId?: string;
}, requesterOrgId?: string) {
  const reader = await db.parkingReader.findUnique({ where: { id: data.readerId } });
  if (!reader) throw new NotFoundError('Parking reader not found');

  const facilityId = reader.facilityId;
  if (requesterOrgId) {
    const facility = await repo.findFacilityById(facilityId);
    if (!facility || facility.campus.orgId !== requesterOrgId) {
      throw new NotFoundError('Parking reader not found');
    }
  }

  const capturedAt = data.capturedAt ?? new Date();

  const event = await repo.createParkingEvent({
    readerId: data.readerId,
    facilityId,
    plateNumber: data.plateNumber,
    eventType: data.eventType,
    capturedAt,
    imageAssetId: data.imageAssetId,
  });

  if (!data.plateNumber) {
    // no_plate exception created at repo level inside createParkingEvent
    return { event, action: 'no_plate_exception' };
  }

  if (data.eventType === 'entry') {
    const existingSession = await repo.findActiveSessionByPlate(facilityId, data.plateNumber);
    if (existingSession) {
      await repo.createException({
        facilityId,
        type: ParkingExceptionType.DUPLICATE_PLATE,
        relatedSessionId: existingSession.id,
        relatedEventId: event.id,
        description: `Plate ${data.plateNumber} entered while an active session already exists`,
      });
      return { event, action: 'duplicate_plate_exception' };
    }

    const session = await repo.createSession({
      facilityId,
      plateNumber: data.plateNumber,
      entryEventId: event.id,
      entryAt: capturedAt,
    });
    return { event, session, action: 'session_created' };
  }

  if (data.eventType === 'exit') {
    const activeSession = await repo.findActiveSessionByPlate(facilityId, data.plateNumber);
    if (!activeSession) {
      await repo.createException({
        facilityId,
        type: ParkingExceptionType.INCONSISTENT_ENTRY_EXIT,
        relatedEventId: event.id,
        description: `Exit event for plate ${data.plateNumber} with no matching active session`,
      });
      return { event, action: 'inconsistent_entry_exit_exception' };
    }

    const session = await repo.completeSession(activeSession.id, event.id, capturedAt);
    return { event, session, action: 'session_completed' };
  }

  return { event, action: 'noop' };
}

// ---- Overtime check ----

export async function checkOvertimeSessions(facilityId: string, overtimeThresholdHours = OVERTIME_THRESHOLD_HOURS) {
  const threshold = new Date(Date.now() - overtimeThresholdHours * 60 * 60 * 1000);
  const sessions = await repo.findActiveSessionsOlderThan(facilityId, threshold);

  const results: string[] = [];
  for (const session of sessions) {
    const alreadyExcepted = await repo.hasOpenOvertimeException(session.id);
    if (!alreadyExcepted) {
      await repo.createException({
        facilityId,
        type: ParkingExceptionType.OVERTIME,
        relatedSessionId: session.id,
        description: `Vehicle with plate ${session.plateNumber} has been parked for over ${overtimeThresholdHours} hours`,
      });
      results.push(session.id);
    }
  }

  return results;
}

export async function checkUnsettledSessions(
  facilityId: string,
  unsettledThresholdMinutes = UNSETTLED_THRESHOLD_MINUTES,
) {
  const threshold = new Date(Date.now() - unsettledThresholdMinutes * 60 * 1000);
  const sessions = await repo.findCompletedSessionsOlderThan(facilityId, threshold);

  const results: string[] = [];
  for (const session of sessions) {
    const alreadyExcepted = await repo.hasUnsettledException(session.id);
    if (!alreadyExcepted) {
      await repo.createException({
        facilityId,
        type: ParkingExceptionType.UNSETTLED,
        relatedSessionId: session.id,
        description: `Session for plate ${session.plateNumber} is unsettled beyond ${unsettledThresholdMinutes} minutes`,
      });
      results.push(session.id);
    }
  }

  return results;
}

// ---- Escalation ----

export async function escalateDueExceptions(facilityId: string) {
  const openExceptions = await repo.findOpenExceptionsByFacility(facilityId);
  const escalationThresholdMs = getConfig().config.parkingEscalationMinutes * 60 * 1000;
  const now = new Date();

  const eligible = openExceptions.filter((ex) =>
    isEscalationEligible(
      { status: ex.status as ParkingExceptionStatus, createdAt: ex.createdAt },
      now,
      escalationThresholdMs,
    ),
  );

  if (eligible.length === 0) return [];

  // Find a supervisor user to escalate to (OpsManager role)
  const supervisorRole = await db.role.findFirst({ where: { name: 'OpsManager' } });
  if (!supervisorRole) return [];

  const supervisorUserRole = await db.userRole.findFirst({ where: { roleId: supervisorRole.id } });
  if (!supervisorUserRole) return [];

  const escalated: string[] = [];
  for (const ex of eligible) {
    await repo.escalateException(ex.id, supervisorUserRole.userId);
    escalated.push(ex.id);
  }

  return escalated;
}

// ---- Status summary ----

export async function getParkingStatusSummary(facilityId: string, orgId?: string) {
  return repo.getParkingStatus(facilityId, orgId);
}
