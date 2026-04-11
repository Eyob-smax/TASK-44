import { ForbiddenError, NotFoundError, UnprocessableError } from '../../common/errors/app-errors.js';
import { AnomalyType, AnomalySeverity, AnomalyStatus, type DashboardClassroomResponse } from './types.js';
import { getConfig } from '../configuration/service.js';
import * as repo from './repository.js';

function getOfflineAnomalyThresholdMs(): number {
  return getConfig().config.heartbeatFreshnessSeconds * 1000;
}

// ---- Heartbeat ----

export async function ingestHeartbeat(classroomId: string, metadata?: Record<string, unknown>) {
  const classroom = await repo.findClassroomById(classroomId);
  if (!classroom) throw new NotFoundError('Classroom not found');

  const wasOfflineTooLong =
    classroom.lastHeartbeatAt !== null &&
    Date.now() - classroom.lastHeartbeatAt.getTime() > getOfflineAnomalyThresholdMs();

  if (wasOfflineTooLong || classroom.status === 'offline') {
    // Only raise if not already an open connectivity_loss anomaly for this classroom
    await repo.createAnomalyEvent({
      classroomId,
      type: AnomalyType.CONNECTIVITY_LOSS,
      severity: AnomalySeverity.HIGH,
      description: 'Classroom came back online after extended offline period',
    });
  }

  return repo.upsertHeartbeat(classroomId, metadata);
}

// ---- Confidence ----

export async function ingestConfidence(classroomId: string, confidence: number) {
  const classroom = await repo.findClassroomById(classroomId);
  if (!classroom) throw new NotFoundError('Classroom not found');

  await repo.insertConfidenceSample(classroomId, confidence);

  if (confidence < 0.5) {
    await repo.createAnomalyEvent({
      classroomId,
      type: AnomalyType.CONFIDENCE_DROP,
      severity: AnomalySeverity.HIGH,
      description: `Recognition confidence critically low: ${(confidence * 100).toFixed(1)}%`,
    });
  } else if (confidence < 0.7) {
    await repo.createAnomalyEvent({
      classroomId,
      type: AnomalyType.CONFIDENCE_DROP,
      severity: AnomalySeverity.MEDIUM,
      description: `Recognition confidence below threshold: ${(confidence * 100).toFixed(1)}%`,
    });
  }
}

// ---- Anomaly lifecycle ----

export async function acknowledgeAnomaly(anomalyEventId: string, userId: string) {
  const anomaly = await repo.findAnomalyById(anomalyEventId);
  if (!anomaly) throw new NotFoundError('Anomaly event not found');
  if (anomaly.status !== AnomalyStatus.OPEN) {
    throw new UnprocessableError(`Cannot acknowledge anomaly with status '${anomaly.status}'`);
  }
  return repo.createAcknowledgement(anomalyEventId, userId);
}

export async function assignAnomaly(
  anomalyEventId: string,
  assignedToUserId: string,
  assignedByUserId: string,
) {
  const anomaly = await repo.findAnomalyById(anomalyEventId);
  if (!anomaly) throw new NotFoundError('Anomaly event not found');
  if (
    anomaly.status !== AnomalyStatus.OPEN &&
    anomaly.status !== AnomalyStatus.ACKNOWLEDGED
  ) {
    throw new UnprocessableError(`Cannot assign anomaly with status '${anomaly.status}'`);
  }
  return repo.createAssignment(anomalyEventId, assignedToUserId, assignedByUserId);
}

export async function resolveAnomaly(
  anomalyEventId: string,
  userId: string,
  resolutionNote: string,
) {
  const anomaly = await repo.findAnomalyById(anomalyEventId);
  if (!anomaly) throw new NotFoundError('Anomaly event not found');
  if (anomaly.status === AnomalyStatus.RESOLVED) {
    throw new UnprocessableError('Anomaly is already resolved');
  }
  return repo.createResolution(anomalyEventId, userId, resolutionNote);
}

// ---- Dashboard ----

export async function getClassroomDashboard(campusId: string): Promise<DashboardClassroomResponse[]> {
  const classrooms = await repo.listClassroomsByCampus(campusId);

  const results = await Promise.all(
    classrooms.map(async (c) => {
      const [latestSample, openAnomalyCount] = await Promise.all([
        repo.getLatestConfidence(c.id),
        repo.countOpenAnomaliesByClassroom(c.id),
      ]);

      return {
        id: c.id,
        name: c.name,
        building: c.building,
        room: c.room,
        status: c.status as DashboardClassroomResponse['status'],
        lastHeartbeatAt: c.lastHeartbeatAt?.toISOString() ?? null,
        latestConfidence: latestSample?.confidence ?? null,
        openAnomalyCount,
      };
    }),
  );

  return results;
}
