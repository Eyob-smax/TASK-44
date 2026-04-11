import { db } from '../../app/container.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/app-errors.js';
import type { AnomalyType, AnomalySeverity } from './types.js';

// ---- Classrooms ----

export async function findClassroomById(id: string) {
  return db.classroom.findUnique({
    where: { id },
    include: { campus: { select: { orgId: true } } },
  });
}

export async function findCampusById(id: string) {
  return db.campus.findUnique({ where: { id } });
}

export async function listClassroomsByCampus(campusId: string) {
  return db.classroom.findMany({
    where: { campusId },
    orderBy: { name: 'asc' },
  });
}

// ---- Heartbeats ----

export async function upsertHeartbeat(classroomId: string, metadata?: Record<string, unknown>) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const heartbeat = await tx.classroomHeartbeat.create({
      data: {
        classroomId,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
    await tx.classroom.update({
      where: { id: classroomId },
      data: { status: 'online', lastHeartbeatAt: now },
    });
    return heartbeat;
  });
}

// ---- Confidence samples ----

export async function insertConfidenceSample(classroomId: string, confidence: number) {
  return db.recognitionConfidenceSample.create({
    data: { classroomId, confidence },
  });
}

export async function getLatestConfidence(classroomId: string) {
  return db.recognitionConfidenceSample.findFirst({
    where: { classroomId },
    orderBy: { sampledAt: 'desc' },
  });
}

// ---- Anomaly events ----

export async function createAnomalyEvent(data: {
  classroomId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description?: string;
}) {
  return db.anomalyEvent.create({
    data: {
      classroomId: data.classroomId,
      type: data.type,
      severity: data.severity,
      description: data.description ?? null,
      status: 'open',
    },
  });
}

export async function findAnomalyById(id: string) {
  return db.anomalyEvent.findUnique({
    where: { id },
    include: {
      classroom: { include: { campus: { select: { orgId: true } } } },
      acknowledgement: true,
      assignment: true,
      resolution: true,
    },
  });
}

export async function listAnomalies(
  filters: { classroomId?: string; status?: string; severity?: string },
  pagination: { page: number; limit: number },
  orgId?: string,
) {
  const where = {
    ...(filters.classroomId && { classroomId: filters.classroomId }),
    ...(filters.status && { status: filters.status }),
    ...(filters.severity && { severity: filters.severity }),
    ...(orgId && { classroom: { campus: { orgId } } }),
  };

  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    db.anomalyEvent.findMany({
      where,
      skip,
      take: limit,
      include: {
        classroom: true,
        acknowledgement: true,
        assignment: true,
        resolution: true,
      },
      orderBy: { detectedAt: 'desc' },
    }),
    db.anomalyEvent.count({ where }),
  ]);

  return { events, total };
}

export async function countOpenAnomaliesByClassroom(classroomId: string) {
  return db.anomalyEvent.count({ where: { classroomId, status: 'open' } });
}

// ---- Acknowledgement ----

export async function createAcknowledgement(anomalyEventId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.anomalyAcknowledgement.findUnique({ where: { anomalyEventId } });
    if (existing) throw new ConflictError('Anomaly is already acknowledged');

    const ack = await tx.anomalyAcknowledgement.create({
      data: { anomalyEventId, userId },
    });
    await tx.anomalyEvent.update({
      where: { id: anomalyEventId },
      data: { status: 'acknowledged' },
    });
    return ack;
  });
}

// ---- Assignment ----

export async function createAssignment(
  anomalyEventId: string,
  assignedToUserId: string,
  assignedByUserId: string,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.anomalyAssignment.findUnique({ where: { anomalyEventId } });
    if (existing) throw new ConflictError('Anomaly is already assigned');

    const assignment = await tx.anomalyAssignment.create({
      data: { anomalyEventId, assignedToUserId, assignedByUserId },
    });
    await tx.anomalyEvent.update({
      where: { id: anomalyEventId },
      data: { status: 'assigned' },
    });
    return assignment;
  });
}

// ---- Resolution ----

export async function createResolution(
  anomalyEventId: string,
  userId: string,
  resolutionNote: string,
) {
  if (!resolutionNote || resolutionNote.trim().length === 0) {
    throw new ValidationError('Resolution note is required and must not be empty', {
      resolutionNote: ['Resolution note is required'],
    });
  }

  return db.$transaction(async (tx) => {
    const now = new Date();
    const resolution = await tx.anomalyResolution.create({
      data: { anomalyEventId, userId, resolutionNote: resolutionNote.trim() },
    });
    await tx.anomalyEvent.update({
      where: { id: anomalyEventId },
      data: { status: 'resolved', resolvedAt: now },
    });
    return resolution;
  });
}
