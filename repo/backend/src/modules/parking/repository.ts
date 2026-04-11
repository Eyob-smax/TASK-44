import { db } from '../../app/container.js';
import { NotFoundError, ValidationError } from '../../common/errors/app-errors.js';
import { ParkingExceptionType, calculateTurnoverPerHour } from './types.js';

// ---- Facilities ----

export async function findFacilityById(id: string) {
  return db.parkingFacility.findUnique({
    where: { id },
    include: { campus: { select: { orgId: true } } },
  });
}

export async function listFacilities(orgId?: string) {
  return db.parkingFacility.findMany({
    where: {
      ...(orgId && { campus: { orgId } }),
    },
    orderBy: { name: 'asc' },
  });
}

export async function listFacilitiesByCampus(campusId: string) {
  return db.parkingFacility.findMany({ where: { campusId }, orderBy: { name: 'asc' } });
}

// ---- Events ----

export async function createParkingEvent(data: {
  readerId: string;
  facilityId: string;
  plateNumber?: string | null;
  eventType: string;
  capturedAt?: Date;
  imageAssetId?: string;
}) {
  return db.$transaction(async (tx) => {
    const event = await tx.parkingEvent.create({
      data: {
        readerId: data.readerId,
        plateNumber: data.plateNumber ?? null,
        eventType: data.eventType,
        capturedAt: data.capturedAt ?? new Date(),
        imageAssetId: data.imageAssetId ?? null,
      },
    });

    if (!data.plateNumber) {
      await tx.parkingException.create({
        data: {
          facilityId: data.facilityId,
          type: ParkingExceptionType.NO_PLATE,
          relatedEventId: event.id,
          description: 'Vehicle entered without a readable plate number',
          status: 'open',
        },
      });
    }

    return event;
  });
}

// ---- Sessions ----

export async function findActiveSessions(facilityId: string) {
  return db.parkingSession.findMany({
    where: { facilityId, status: 'active' },
    orderBy: { entryAt: 'asc' },
  });
}

export async function findActiveSessionByPlate(facilityId: string, plateNumber: string) {
  return db.parkingSession.findFirst({
    where: { facilityId, plateNumber, status: 'active' },
  });
}

export async function createSession(data: {
  facilityId: string;
  plateNumber: string;
  entryEventId: string;
  entryAt: Date;
}) {
  return db.parkingSession.create({
    data: {
      facilityId: data.facilityId,
      plateNumber: data.plateNumber,
      entryEventId: data.entryEventId,
      entryAt: data.entryAt,
      status: 'active',
    },
  });
}

export async function completeSession(sessionId: string, exitEventId: string, exitAt: Date) {
  return db.parkingSession.update({
    where: { id: sessionId },
    data: { status: 'completed', exitEventId, exitAt },
  });
}

// ---- Exceptions ----

export async function createException(data: {
  facilityId: string;
  type: string;
  relatedSessionId?: string;
  relatedEventId?: string;
  description?: string;
}) {
  return db.parkingException.create({
    data: {
      facilityId: data.facilityId,
      type: data.type,
      relatedSessionId: data.relatedSessionId ?? null,
      relatedEventId: data.relatedEventId ?? null,
      description: data.description ?? null,
      status: 'open',
    },
  });
}

export async function findExceptions(
  filters: { facilityId?: string; type?: string; status?: string },
  pagination: { page: number; limit: number },
  orgId?: string,
) {
  const where = {
    ...(filters.facilityId && { facilityId: filters.facilityId }),
    ...(filters.type && { type: filters.type }),
    ...(filters.status && { status: filters.status }),
    ...(orgId && { facility: { campus: { orgId } } }),
  };

  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  const [exceptions, total] = await Promise.all([
    db.parkingException.findMany({
      where,
      skip,
      take: limit,
      include: { facility: true, escalation: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.parkingException.count({ where }),
  ]);

  return { exceptions, total };
}

export async function findExceptionById(id: string) {
  return db.parkingException.findUnique({
    where: { id },
    include: {
      facility: { include: { campus: { select: { orgId: true } } } },
      escalation: true,
    },
  });
}

export async function findOpenExceptionsByFacility(facilityId: string) {
  return db.parkingException.findMany({
    where: { facilityId, status: 'open' },
    orderBy: { createdAt: 'asc' },
  });
}

export async function escalateException(exceptionId: string, escalatedToUserId: string) {
  return db.$transaction(async (tx) => {
    const now = new Date();
    const escalation = await tx.parkingEscalation.create({
      data: { exceptionId, escalatedToUserId },
    });
    await tx.parkingException.update({
      where: { id: exceptionId },
      data: { status: 'escalated', escalatedAt: now },
    });
    return escalation;
  });
}

export async function resolveException(exceptionId: string, resolutionNote: string) {
  if (!resolutionNote || resolutionNote.trim().length === 0) {
    throw new ValidationError('Resolution note is required to close a parking exception', {
      resolutionNote: ['Resolution note is required'],
    });
  }

  return db.parkingException.update({
    where: { id: exceptionId },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
      resolutionNote: resolutionNote.trim(),
    },
  });
}

// ---- Status / metrics ----

export async function getParkingStatus(facilityId: string, orgId?: string) {
  const facility = await db.parkingFacility.findUnique({
    where: { id: facilityId },
    include: { campus: { select: { orgId: true } } },
  });
  if (!facility) throw new NotFoundError('Parking facility not found');
  if (orgId && facility.campus.orgId !== orgId) {
    throw new NotFoundError('Parking facility not found');
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [activeSessions, entryEventsInLastHour, openExceptions, escalatedExceptions] =
    await Promise.all([
      db.parkingSession.count({ where: { facilityId, status: 'active' } }),
      db.parkingEvent.count({
        where: {
          eventType: 'entry',
          capturedAt: { gte: oneHourAgo },
          reader: { facilityId },
        },
      }),
      db.parkingException.count({ where: { facilityId, status: 'open' } }),
      db.parkingException.count({ where: { facilityId, status: 'escalated' } }),
    ]);

  return {
    facilityId,
    facilityName: facility.name,
    totalSpaces: facility.totalSpaces,
    occupiedSpaces: activeSessions,
    availableSpaces: Math.max(0, facility.totalSpaces - activeSessions),
    turnoverPerHour: calculateTurnoverPerHour(entryEventsInLastHour),
    openExceptions,
    escalatedExceptions,
  };
}

export async function findActiveSessionsOlderThan(facilityId: string, thresholdDate: Date) {
  return db.parkingSession.findMany({
    where: { facilityId, status: 'active', entryAt: { lte: thresholdDate } },
  });
}

export async function findCompletedSessionsOlderThan(facilityId: string, thresholdDate: Date) {
  return db.parkingSession.findMany({
    where: {
      facilityId,
      status: 'completed',
      exitAt: { not: null, lte: thresholdDate },
    },
  });
}

export async function hasOpenOvertimeException(sessionId: string) {
  const count = await db.parkingException.count({
    where: { relatedSessionId: sessionId, type: ParkingExceptionType.OVERTIME, status: 'open' },
  });
  return count > 0;
}

export async function hasUnsettledException(sessionId: string) {
  const count = await db.parkingException.count({
    where: { relatedSessionId: sessionId, type: ParkingExceptionType.UNSETTLED },
  });
  return count > 0;
}
