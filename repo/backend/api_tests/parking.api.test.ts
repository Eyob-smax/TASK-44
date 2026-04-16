import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { parkingRouter } from '../src/modules/parking/routes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { ValidationError } from '../src/common/errors/app-errors.js';

vi.mock('../src/modules/parking/service.js', () => ({
  ingestParkingEvent: vi.fn(),
  getParkingStatusSummary: vi.fn(),
  checkOvertimeSessions: vi.fn(),
  escalateDueExceptions: vi.fn(),
}));

vi.mock('../src/modules/parking/repository.js', () => ({
  findFacilityById: vi.fn(),
  listFacilities: vi.fn().mockResolvedValue([]),
  listFacilitiesByCampus: vi.fn().mockResolvedValue([]),
  createParkingEvent: vi.fn(),
  findActiveSessions: vi.fn().mockResolvedValue([]),
  createSession: vi.fn(),
  completeSession: vi.fn(),
  createException: vi.fn(),
  findExceptions: vi.fn().mockResolvedValue({ exceptions: [], total: 0 }),
  findExceptionById: vi.fn(),
  escalateException: vi.fn(),
  resolveException: vi.fn(),
  getParkingStatus: vi.fn(),
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

const { ingestParkingEvent, getParkingStatusSummary } = await import('../src/modules/parking/service.js');
const { resolveException, findExceptionById, findExceptions, listFacilities } = await import('../src/modules/parking/repository.js');

const jwtSecret = process.env.JWT_SECRET ?? 'test-jwt-secret';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'user-1',
      username: 'test',
      roles: ['OpsManager'],
      permissions: ['write:parking:*', 'read:parking:*'],
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
  app.use('/api/parking', parkingRouter);
  app.use(errorHandler);
  return app;
}

describe('POST /api/parking/events', () => {
  beforeEach(() => vi.clearAllMocks());

  const validEntryBody = {
    readerId: '00000000-0000-0000-0000-000000000001',
    plateNumber: 'ABC-123',
    eventType: 'entry',
  };

  it('returns 200 and creates session on valid entry event', async () => {
    vi.mocked(ingestParkingEvent).mockResolvedValue({
      event: { id: 'evt-1', readerId: validEntryBody.readerId, eventType: 'entry', plateNumber: 'ABC-123' },
      session: { id: 'sess-1', facilityId: 'fac-1', plateNumber: 'ABC-123', status: 'active' },
      exception: null,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/events')
      .set('Authorization', authHeader())
      .send(validEntryBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session).toBeDefined();
    expect(res.body.data.exception).toBeNull();
  });

  it('returns 200 and creates no_plate exception when plateNumber is absent', async () => {
    vi.mocked(ingestParkingEvent).mockResolvedValue({
      event: { id: 'evt-2', readerId: validEntryBody.readerId, eventType: 'entry', plateNumber: null },
      session: null,
      exception: { id: 'exc-1', type: 'no_plate', status: 'open' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/events')
      .set('Authorization', authHeader())
      .send({ readerId: validEntryBody.readerId, eventType: 'entry', plateNumber: null });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exception).toBeDefined();
    expect(res.body.data.exception.type).toBe('no_plate');
  });

  it('returns 200 and creates duplicate_plate exception when same plate enters twice', async () => {
    vi.mocked(ingestParkingEvent).mockResolvedValue({
      event: { id: 'evt-3', readerId: validEntryBody.readerId, eventType: 'entry', plateNumber: 'ABC-123' },
      session: null,
      exception: { id: 'exc-2', type: 'duplicate_plate', status: 'open' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/events')
      .set('Authorization', authHeader())
      .send(validEntryBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exception.type).toBe('duplicate_plate');
  });

  it('returns 400 VALIDATION_ERROR when readerId is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/events')
      .set('Authorization', authHeader())
      .send({ eventType: 'entry', plateNumber: 'ABC-123' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/parking/exceptions/:id/resolve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 when resolutionNote is provided', async () => {
    vi.mocked(findExceptionById).mockResolvedValue({
      id: 'exc-1',
      facility: { campus: { orgId: 'org-1' } },
    } as any);
    vi.mocked(resolveException).mockResolvedValue({
      id: 'exc-1',
      status: 'resolved',
      resolutionNote: 'Issue handled on-site',
      resolvedAt: new Date(),
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/exceptions/exc-1/resolve')
      .set('Authorization', authHeader())
      .send({ resolutionNote: 'Issue handled on-site' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('resolved');
  });

  it('returns 400 VALIDATION_ERROR when resolutionNote is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/exceptions/exc-1/resolve')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when resolutionNote is empty string', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/exceptions/exc-1/resolve')
      .set('Authorization', authHeader())
      .send({ resolutionNote: '' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/parking/exceptions/:id/escalate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000002',
      orgId: 'org-1',
      isActive: true,
      userRoles: [{ role: { name: 'OpsManager' } }],
    } as any);
  });

  it('returns 200 on successful escalation', async () => {
    vi.mocked(findExceptionById).mockResolvedValue({
      id: 'exc-1',
      status: 'open',
      type: 'overtime',
      facility: { campus: { orgId: 'org-1' } },
    } as any);

    const { escalateException } = await import('../src/modules/parking/repository.js');
    vi.mocked(escalateException).mockResolvedValue({
      id: 'esc-1',
      exceptionId: 'exc-1',
      escalatedToUserId: '00000000-0000-0000-0000-000000000002',
      escalatedAt: new Date(),
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/exceptions/exc-1/escalate')
      .set('Authorization', authHeader())
      .send({ escalatedToUserId: '00000000-0000-0000-0000-000000000002' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when exception not found', async () => {
    vi.mocked(findExceptionById).mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/exceptions/nonexistent/escalate')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(404);
  });

  it('returns 404 when exception belongs to a different org', async () => {
    vi.mocked(findExceptionById).mockResolvedValue({
      id: 'exc-foreign',
      status: 'open',
      type: 'overtime',
      facility: { campus: { orgId: 'org-2' } },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/exceptions/exc-foreign/escalate')
      .set('Authorization', authHeader({ orgId: 'org-1' }))
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when escalatedToUserId is not a valid UUID', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/exceptions/exc-1/escalate')
      .set('Authorization', authHeader())
      .send({ escalatedToUserId: 'user-2' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when escalation target belongs to a different org', async () => {
    vi.mocked(findExceptionById).mockResolvedValue({
      id: 'exc-1',
      status: 'open',
      type: 'overtime',
      facility: { campus: { orgId: 'org-1' } },
    } as any);
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000003',
      orgId: 'org-2',
      isActive: true,
      userRoles: [{ role: { name: 'OpsManager' } }],
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/parking/exceptions/exc-1/escalate')
      .set('Authorization', authHeader())
      .send({ escalatedToUserId: '00000000-0000-0000-0000-000000000003' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/parking/exceptions/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when exception belongs to a different org', async () => {
    vi.mocked(findExceptionById).mockResolvedValue({
      id: 'exc-foreign',
      facility: { campus: { orgId: 'org-2' } },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/parking/exceptions/exc-foreign')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/parking/facilities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with facilities scoped to caller org', async () => {
    vi.mocked(listFacilities).mockResolvedValue([
      { id: 'fac-1', name: 'Lot A', campusId: 'campus-1', totalSpaces: 100 } as any,
    ]);

    const app = buildApp();
    const res = await request(app)
      .get('/api/parking/facilities')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(listFacilities).toHaveBeenCalledWith('org-1');
  });

  it('returns 403 when user lacks read:parking permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/parking/facilities')
      .set('Authorization', authHeader({ roles: ['Viewer'], permissions: ['read:logistics:*'] }));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/parking/facilities/:id/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with facility status summary', async () => {
    vi.mocked(getParkingStatusSummary).mockResolvedValue({
      facilityId: 'fac-1',
      occupiedSpaces: 42,
      availableSpaces: 58,
      turnoverPerHour: 6,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/parking/facilities/fac-1/status')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.facilityId).toBe('fac-1');
    expect(getParkingStatusSummary).toHaveBeenCalledWith('fac-1', 'org-1');
  });

  it('returns 404 when facility not found in caller org', async () => {
    vi.mocked(getParkingStatusSummary).mockRejectedValue(new (await import('../src/common/errors/app-errors.js')).NotFoundError('Parking facility not found'));

    const app = buildApp();
    const res = await request(app)
      .get('/api/parking/facilities/missing/status')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 when user lacks read:parking permission', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/parking/facilities/fac-1/status')
      .set('Authorization', authHeader({ roles: ['Viewer'], permissions: ['read:logistics:*'] }));

    expect(res.status).toBe(403);
  });
});

describe('GET /api/parking/exceptions (type filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('supports unsettled type filtering', async () => {
    vi.mocked(findExceptions).mockResolvedValue({
      exceptions: [
        {
          id: 'exc-unsettled-1',
          type: 'unsettled',
          status: 'open',
          facilityName: 'Lot A',
          plateNumber: 'ABC-123',
          createdAt: new Date().toISOString(),
          minutesSinceCreated: 45,
          isEscalationEligible: true,
        },
      ],
      total: 1,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/parking/exceptions?type=unsettled')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exceptions).toHaveLength(1);
    expect(res.body.data.exceptions[0].type).toBe('unsettled');
  });
});
