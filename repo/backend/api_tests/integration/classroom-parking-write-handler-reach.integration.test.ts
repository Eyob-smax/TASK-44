import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { classroomOpsRouter } from '../../src/modules/classroom-ops/routes.js';
import { parkingRouter } from '../../src/modules/parking/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `classroom-parking-write-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-classroom-parking-int';

let orgId = '';
let campusId = '';
let classroomId = '';
let userId = '';
let parkingFacilityId = '';
let parkingReaderId = '';
let anomalyIdForGet = '';
let anomalyIdForResolve = '';
let parkingExceptionId = '';
let parkingExceptionIdForEscalate = '';
let assigneeUserId = '';
let supervisorRoleId = '';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId,
      username: `classroom-parking-user-${RUN_ID}`,
      roles: ['Administrator', 'OpsManager', 'ClassroomSupervisor'],
      permissions: ['read:classroom-ops:*', 'write:classroom-ops:*', 'read:parking:*', 'write:parking:*'],
      orgId,
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/classroom-ops', classroomOpsRouter);
  app.use('/api/parking', parkingRouter);
  app.use(errorHandler);
  return app;
}

describe('No-mock HTTP integration: classroom + parking write handler reach', () => {
  beforeAll(async () => {
    const org = await db.organization.create({
      data: {
        name: `Classroom/Parking Org ${RUN_ID}`,
        type: 'district',
        timezone: 'UTC',
      },
    });
    orgId = org.id;

    const campus = await db.campus.create({
      data: {
        orgId,
        name: `Campus ${RUN_ID}`,
      },
    });
    campusId = campus.id;

    const classroom = await db.classroom.create({
      data: {
        campusId,
        name: `Classroom ${RUN_ID}`,
        building: 'Main',
        room: '101',
        capacity: 40,
      },
    });
    classroomId = classroom.id;

    const user = await db.user.create({
      data: {
        username: `classroom-parking-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Classroom Parking Integration User',
        isActive: true,
        orgId,
      },
    });
    userId = user.id;

    // Escalation target must have OpsManager or Administrator role.
    // Use OpsManager to avoid mutating/deleting the shared Administrator role.
    const supervisorRole = await db.role.upsert({
      where: { name: 'OpsManager' },
      update: {},
      create: {
        name: 'OpsManager',
        description: 'Integration supervisor role for classroom/parking test',
        isSystem: false,
      },
    });
    supervisorRoleId = supervisorRole.id;

    const assignee = await db.user.create({
      data: {
        username: `classroom-parking-assignee-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Classroom Parking Assignee',
        isActive: true,
        orgId,
      },
    });
    assigneeUserId = assignee.id;
    await db.userRole.create({ data: { userId: assigneeUserId, roleId: supervisorRoleId } });

    const facility = await db.parkingFacility.create({
      data: {
        campusId,
        name: `Facility ${RUN_ID}`,
        totalSpaces: 100,
      },
    });
    parkingFacilityId = facility.id;

    const reader = await db.parkingReader.create({
      data: {
        facilityId: parkingFacilityId,
        type: 'entry',
        location: 'Gate A',
      },
    });
    parkingReaderId = reader.id;
  });

  afterAll(async () => {
    // ParkingEscalation holds a strict FK to users.escalatedToUserId, so remove
    // escalations before deleting the assignee user.
    if (assigneeUserId) {
      await db.parkingEscalation.deleteMany({ where: { escalatedToUserId: assigneeUserId } });
      await db.anomalyAssignment.deleteMany({ where: { assignedToUserId: assigneeUserId } });
      await db.afterSalesTicket.deleteMany({ where: { assignedToUserId: assigneeUserId } });
    }
    await db.parkingEscalation.deleteMany({ where: { exceptionId: { in: [parkingExceptionId, parkingExceptionIdForEscalate].filter(Boolean) } } });
    await db.parkingException.deleteMany({ where: { id: { in: [parkingExceptionId, parkingExceptionIdForEscalate].filter(Boolean) } } });
    await db.parkingSession.deleteMany({ where: { facilityId: parkingFacilityId } });
    await db.parkingEvent.deleteMany({ where: { readerId: parkingReaderId } });
    if (parkingReaderId) await db.parkingReader.deleteMany({ where: { id: parkingReaderId } });
    if (parkingFacilityId) await db.parkingFacility.deleteMany({ where: { id: parkingFacilityId } });

    if (assigneeUserId) {
      await db.userRole.deleteMany({ where: { userId: assigneeUserId } });
      await db.user.deleteMany({ where: { id: assigneeUserId } });
    }

    await db.anomalyResolution.deleteMany({ where: { anomalyEventId: { in: [anomalyIdForGet, anomalyIdForResolve].filter(Boolean) } } });
    await db.anomalyAssignment.deleteMany({ where: { anomalyEventId: { in: [anomalyIdForGet, anomalyIdForResolve].filter(Boolean) } } });
    await db.anomalyAcknowledgement.deleteMany({ where: { anomalyEventId: { in: [anomalyIdForGet, anomalyIdForResolve].filter(Boolean) } } });
    await db.anomalyEvent.deleteMany({ where: { id: { in: [anomalyIdForGet, anomalyIdForResolve].filter(Boolean) } } });
    await db.recognitionConfidenceSample.deleteMany({ where: { classroomId } });
    await db.classroomHeartbeat.deleteMany({ where: { classroomId } });

    if (classroomId) await db.classroom.deleteMany({ where: { id: classroomId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    if (campusId) await db.campus.deleteMany({ where: { id: campusId } });
    if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
  });

  it('covers classroom-ops handlers without mocks', async () => {
    const app = buildApp();

    const heartbeatRes = await request(app)
      .post('/api/classroom-ops/heartbeat')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `classroom-heartbeat-${RUN_ID}`)
      .send({ classroomId, metadata: { source: 'integration' } });
    expect(heartbeatRes.status).toBe(200);
    expect(heartbeatRes.body.success).toBe(true);
    const latestHeartbeat = await db.classroomHeartbeat.findFirst({
      where: { classroomId },
      orderBy: { receivedAt: 'desc' },
    });
    expect(latestHeartbeat).toBeTruthy();
    const classroomAfterHeartbeat = await db.classroom.findUnique({ where: { id: classroomId } });
    expect(classroomAfterHeartbeat?.status).toBe('online');

    const confidenceRes = await request(app)
      .post('/api/classroom-ops/confidence')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `classroom-confidence-${RUN_ID}`)
      .send({ classroomId, confidence: 0.85 });
    expect(confidenceRes.status).toBe(200);
    const latestConfidence = await db.recognitionConfidenceSample.findFirst({
      where: { classroomId },
      orderBy: { sampledAt: 'desc' },
    });
    expect(latestConfidence?.confidence).toBe(0.85);

    const reportRes = await request(app)
      .post('/api/classroom-ops/anomalies')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `classroom-anomaly-${RUN_ID}`)
      .send({
        classroomId,
        type: 'connectivity_loss',
        severity: 'high',
        description: 'Connectivity degraded',
      });
    expect(reportRes.status).toBe(201);
    anomalyIdForGet = reportRes.body.data.id as string;
    const anomalyA = await db.anomalyEvent.findUnique({ where: { id: anomalyIdForGet } });
    expect(anomalyA?.status).toBe('open');

    const reportRes2 = await request(app)
      .post('/api/classroom-ops/anomalies')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `classroom-anomaly-2-${RUN_ID}`)
      .send({
        classroomId,
        type: 'confidence_drop',
        severity: 'medium',
        description: 'Confidence unstable',
      });
    expect(reportRes2.status).toBe(201);
    anomalyIdForResolve = reportRes2.body.data.id as string;
    const anomalyB = await db.anomalyEvent.findUnique({ where: { id: anomalyIdForResolve } });
    expect(anomalyB?.status).toBe('open');

    const listRes = await request(app)
      .get('/api/classroom-ops/anomalies')
      .set('Authorization', authHeader());
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data.anomalies)).toBe(true);
    expect(listRes.body.data.total).toBeGreaterThanOrEqual(2);

    const getRes = await request(app)
      .get(`/api/classroom-ops/anomalies/${anomalyIdForGet}`)
      .set('Authorization', authHeader());
    expect(getRes.status).toBe(200);

    const ackRes = await request(app)
      .post(`/api/classroom-ops/anomalies/${anomalyIdForGet}/acknowledge`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `classroom-ack-${RUN_ID}`)
      .send({});
    expect(ackRes.status).toBe(200);
    const acknowledgement = await db.anomalyAcknowledgement.findUnique({
      where: { anomalyEventId: anomalyIdForGet },
    });
    expect(acknowledgement?.userId).toBe(userId);
    const anomalyAfterAck = await db.anomalyEvent.findUnique({ where: { id: anomalyIdForGet } });
    expect(anomalyAfterAck?.status).toBe('acknowledged');

    const assignRes = await request(app)
      .post(`/api/classroom-ops/anomalies/${anomalyIdForGet}/assign`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `classroom-assign-${RUN_ID}`)
      .send({ assignedToUserId: assigneeUserId });
    expect(assignRes.status).toBe(200);
    const assignment = await db.anomalyAssignment.findUnique({
      where: { anomalyEventId: anomalyIdForGet },
    });
    expect(assignment?.assignedToUserId).toBe(assigneeUserId);
    const anomalyAfterAssign = await db.anomalyEvent.findUnique({ where: { id: anomalyIdForGet } });
    expect(anomalyAfterAssign?.status).toBe('assigned');

    const resolveRes = await request(app)
      .post(`/api/classroom-ops/anomalies/${anomalyIdForResolve}/resolve`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `classroom-resolve-${RUN_ID}`)
      .send({ resolutionNote: 'Resolved in integration test' });
    expect(resolveRes.status).toBe(200);
    const resolution = await db.anomalyResolution.findUnique({
      where: { anomalyEventId: anomalyIdForResolve },
    });
    expect(resolution?.resolutionNote).toContain('Resolved in integration test');
    const anomalyAfterResolve = await db.anomalyEvent.findUnique({ where: { id: anomalyIdForResolve } });
    expect(anomalyAfterResolve?.status).toBe('resolved');

    const dashboardRes = await request(app)
      .get(`/api/classroom-ops/dashboard?campusId=${campusId}`)
      .set('Authorization', authHeader());
    expect(dashboardRes.status).toBe(200);
    expect(Array.isArray(dashboardRes.body.data)).toBe(true);
    expect(dashboardRes.body.data.some((c: { id: string }) => c.id === classroomId)).toBe(true);
  });

  it('covers parking handlers without mocks', async () => {
    const app = buildApp();

    const ingestRes = await request(app)
      .post('/api/parking/events')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `parking-event-${RUN_ID}`)
      .send({
        readerId: parkingReaderId,
        plateNumber: `ABC${String(Date.now()).slice(-4)}`,
        eventType: 'entry',
      });
    expect(ingestRes.status).toBe(200);
    expect(ingestRes.body.data.action).toBe('session_created');
    const createdSession = await db.parkingSession.findFirst({
      where: { facilityId: parkingFacilityId, status: 'active' },
      orderBy: { entryAt: 'desc' },
    });
    expect(createdSession).toBeTruthy();

    const noPlateRes = await request(app)
      .post('/api/parking/events')
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `parking-event-noplate-${RUN_ID}`)
      .send({
        readerId: parkingReaderId,
        plateNumber: null,
        eventType: 'entry',
      });
    expect(noPlateRes.status).toBe(200);
    expect(noPlateRes.body.data.action).toBe('no_plate_exception');
    const noPlateException = await db.parkingException.findFirst({
      where: { facilityId: parkingFacilityId, type: 'no_plate' },
      orderBy: { createdAt: 'desc' },
    });
    expect(noPlateException).toBeTruthy();

    const facilitiesRes = await request(app)
      .get('/api/parking/facilities')
      .set('Authorization', authHeader());
    expect(facilitiesRes.status).toBe(200);

    const statusRes = await request(app)
      .get(`/api/parking/facilities/${parkingFacilityId}/status`)
      .set('Authorization', authHeader());
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.facilityId).toBe(parkingFacilityId);

    const listExceptionsRes = await request(app)
      .get('/api/parking/exceptions')
      .set('Authorization', authHeader());
    expect(listExceptionsRes.status).toBe(200);

    const firstException = listExceptionsRes.body.data.exceptions?.[0];
    expect(firstException).toBeDefined();
    parkingExceptionId = firstException.id as string;

    const getExceptionRes = await request(app)
      .get(`/api/parking/exceptions/${parkingExceptionId}`)
      .set('Authorization', authHeader());
    expect(getExceptionRes.status).toBe(200);

    const resolveRes = await request(app)
      .post(`/api/parking/exceptions/${parkingExceptionId}/resolve`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `parking-resolve-${RUN_ID}`)
      .send({ resolutionNote: 'Resolved during integration test' });
    expect(resolveRes.status).toBe(200);
    const resolvedException = await db.parkingException.findUnique({ where: { id: parkingExceptionId } });
    expect(resolvedException?.status).toBe('resolved');
    expect(resolvedException?.resolutionNote).toContain('Resolved during integration test');

    const seededEscalationException = await db.parkingException.create({
      data: {
        facilityId: parkingFacilityId,
        type: 'overtime',
        status: 'open',
        description: 'Seeded for escalation handler reach test',
      },
    });
    parkingExceptionIdForEscalate = seededEscalationException.id;

    const listExceptionsRes2 = await request(app)
      .get('/api/parking/exceptions')
      .set('Authorization', authHeader());
    expect(listExceptionsRes2.status).toBe(200);
    expect(Array.isArray(listExceptionsRes2.body.data.exceptions)).toBe(true);

    const escalateRes = await request(app)
      .post(`/api/parking/exceptions/${parkingExceptionIdForEscalate}/escalate`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `parking-escalate-${RUN_ID}`)
      .send({ escalatedToUserId: assigneeUserId });

    expect(escalateRes.status).toBe(200);
    const escalation = await db.parkingEscalation.findUnique({
      where: { exceptionId: parkingExceptionIdForEscalate },
    });
    expect(escalation?.escalatedToUserId).toBe(assigneeUserId);
    const escalatedException = await db.parkingException.findUnique({ where: { id: parkingExceptionIdForEscalate } });
    expect(escalatedException?.status).toBe('escalated');
  });
});
