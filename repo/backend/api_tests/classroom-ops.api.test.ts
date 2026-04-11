import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { classroomOpsRouter } from '../src/modules/classroom-ops/routes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { ConflictError, UnprocessableError } from '../src/common/errors/app-errors.js';

// Mock the service and repository layers so no DB is needed
vi.mock('../src/modules/classroom-ops/service.js', () => ({
  acknowledgeAnomaly: vi.fn(),
  assignAnomaly: vi.fn(),
  resolveAnomaly: vi.fn(),
  getClassroomDashboard: vi.fn(),
  ingestHeartbeat: vi.fn(),
  ingestConfidence: vi.fn(),
}));

vi.mock('../src/modules/classroom-ops/repository.js', () => ({
  createAnomalyEvent: vi.fn(),
  listAnomalies: vi.fn().mockResolvedValue({ events: [], total: 0 }),
  findAnomalyById: vi.fn(),
  createAcknowledgement: vi.fn(),
  createAssignment: vi.fn(),
  createResolution: vi.fn(),
  countOpenAnomaliesByClassroom: vi.fn().mockResolvedValue(0),
  getLatestConfidence: vi.fn().mockResolvedValue(null),
  listClassroomsByCampus: vi.fn().mockResolvedValue([]),
  upsertHeartbeat: vi.fn(),
  insertConfidenceSample: vi.fn(),
  findClassroomById: vi.fn(),
}));

vi.mock('../src/common/middleware/idempotency.js', () => ({
  idempotency: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const { acknowledgeAnomaly, assignAnomaly, resolveAnomaly } = await import('../src/modules/classroom-ops/service.js');
const { findAnomalyById } = await import('../src/modules/classroom-ops/repository.js');

const jwtSecret = process.env.JWT_SECRET ?? 'test-jwt-secret';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'user-1',
      username: 'test',
      roles: ['ClassroomSupervisor'],
      permissions: ['write:classroom-ops:*', 'read:classroom-ops:*'],
      orgId: 'org-1',
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
  app.use(errorHandler);
  return app;
}

describe('POST /api/classroom-ops/anomalies/:id/acknowledge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with acknowledged result on success', async () => {
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(acknowledgeAnomaly).mockResolvedValue({ id: 'ack-1', anomalyEventId: 'event-1', userId: 'user-1', acknowledgedAt: new Date() } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/acknowledge')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 409 when anomaly is already acknowledged', async () => {
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(acknowledgeAnomaly).mockRejectedValue(new ConflictError('Anomaly is already acknowledged'));

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/acknowledge')
      .set('Authorization', authHeader());

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 401 when no token (auth middleware blocks)', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/classroom-ops/anomalies/event-1/acknowledge');
    expect(res.status).toBe(401);
  });

  it('returns 404 when anomaly belongs to a different org', async () => {
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-1',
      classroom: { campus: { orgId: 'org-2' } },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/acknowledge')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/classroom-ops/anomalies/:id/assign', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000002',
      orgId: 'org-1',
      isActive: true,
      userRoles: [{ role: { name: 'ClassroomSupervisor' } }],
    } as any);
  });

  it('returns 200 on successful assignment', async () => {
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(assignAnomaly).mockResolvedValue({
      id: 'assign-1',
      anomalyEventId: 'event-1',
      assignedToUserId: '00000000-0000-0000-0000-000000000002',
      assignedByUserId: '00000000-0000-0000-0000-000000000001',
      assignedAt: new Date(),
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/assign')
      .set('Authorization', authHeader())
      .send({ assignedToUserId: '00000000-0000-0000-0000-000000000002' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 422 when anomaly has invalid status for assignment', async () => {
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(assignAnomaly).mockRejectedValue(new UnprocessableError("Cannot assign anomaly with status 'resolved'"));

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/assign')
      .set('Authorization', authHeader())
      .send({ assignedToUserId: '00000000-0000-0000-0000-000000000002' });

    expect(res.status).toBe(422);
  });

  it('returns 404 when assignee belongs to a different org', async () => {
    const { db } = await import('../src/app/container.js');
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000003',
      orgId: 'org-2',
      isActive: true,
      userRoles: [{ role: { name: 'ClassroomSupervisor' } }],
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/assign')
      .set('Authorization', authHeader())
      .send({ assignedToUserId: '00000000-0000-0000-0000-000000000003' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when assignedToUserId is invalid', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/assign')
      .set('Authorization', authHeader())
      .send({ assignedToUserId: 'user-2' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/classroom-ops/anomalies/:id/resolve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with resolved result when note is provided', async () => {
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(resolveAnomaly).mockResolvedValue({ id: 'res-1', anomalyEventId: 'event-1', userId: 'user-1', resolutionNote: 'Fixed', resolvedAt: new Date() } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/resolve')
      .set('Authorization', authHeader())
      .send({ resolutionNote: 'Fixed the camera connection issue' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 VALIDATION_ERROR when resolutionNote is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/resolve')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when anomaly is already resolved', async () => {
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-1',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(resolveAnomaly).mockRejectedValue(new UnprocessableError('Anomaly is already resolved'));

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-1/resolve')
      .set('Authorization', authHeader())
      .send({ resolutionNote: 'Test note' });

    expect(res.status).toBe(422);
  });

  it('returns 409 when a race-condition duplicate resolve conflicts at the service layer', async () => {
    vi.mocked(findAnomalyById).mockResolvedValue({
      id: 'event-race',
      classroom: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(resolveAnomaly).mockRejectedValue(
      new ConflictError('Resolution already recorded for this anomaly'),
    );

    const app = buildApp();
    const res = await request(app)
      .post('/api/classroom-ops/anomalies/event-race/resolve')
      .set('Authorization', authHeader())
      .send({ resolutionNote: 'Concurrent resolve attempt' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
