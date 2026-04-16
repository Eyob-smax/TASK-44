import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../src/common/middleware/error-handler.js';

vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-master-data');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'test-integration-signing-secret-master-data');

vi.mock('../src/modules/master-data/repository.js', () => ({
  listOrgs: vi.fn(),
  findOrgById: vi.fn(),
  findCampusesByOrg: vi.fn(),
  listStudentsByOrg: vi.fn(),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  listDepartmentsByCampus: vi.fn(),
  findCampusById: vi.fn(),
  createDepartment: vi.fn(),
  findDepartmentById: vi.fn(),
  createCourse: vi.fn(),
  listSemestersByOrg: vi.fn(),
  createSemester: vi.fn(),
  findCourseById: vi.fn(),
  findSemesterById: vi.fn(),
  createClass: vi.fn(),
}));

vi.mock('../src/modules/master-data/service.js', () => ({
  getStudentById: vi.fn(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    role: {
      findFirst: vi.fn().mockResolvedValue({ id: 'role-1' }),
    },
    fieldMaskingRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('../src/common/middleware/idempotency.js', () => ({
  idempotency: (_req: any, _res: any, next: any) => next(),
}));

const { masterDataRouter } = await import('../src/modules/master-data/routes.js');
const {
  findOrgById,
  findCampusesByOrg,
  listStudentsByOrg,
  createStudent,
  updateStudent,
  listDepartmentsByCampus,
  findCampusById,
  createDepartment,
  findDepartmentById,
  createCourse,
  listSemestersByOrg,
  createSemester,
  findCourseById,
  findSemesterById,
  createClass,
} = await import('../src/modules/master-data/repository.js');
const { getStudentById } = await import('../src/modules/master-data/service.js');
const { config } = await import('../src/app/config.js');

const jwtSecret = config.JWT_SECRET;

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
      permissions: ['read:master-data:*', 'write:master-data:*'],
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
  app.use('/api/orgs', masterDataRouter);
  app.use(errorHandler);
  return app;
}

describe('Master data uncovered endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/orgs/:orgId returns org details', async () => {
    vi.mocked(findOrgById).mockResolvedValue({ id: 'org-1', name: 'District A' } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('org-1');
  });

  it('GET /api/orgs/:orgId/campuses returns campuses list', async () => {
    vi.mocked(findCampusesByOrg).mockResolvedValue([{ id: '11111111-1111-1111-1111-111111111111', orgId: 'org-1', name: 'Main Campus' }] as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/campuses')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/orgs/:orgId/students returns paginated students', async () => {
    vi.mocked(listStudentsByOrg).mockResolvedValue({
      students: [{ id: 'stu-1', orgId: 'org-1', firstName: 'Ada', lastName: 'Lovelace' }],
      total: 1,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/students')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(1);
  });

  it('POST /api/orgs/:orgId/students creates a student', async () => {
    vi.mocked(createStudent).mockResolvedValue({
      id: 'stu-2',
      orgId: 'org-1',
      studentNumber: 'S-001',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/students')
      .set('Authorization', authHeader())
      .send({
        studentNumber: 'S-001',
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.studentNumber).toBe('S-001');
  });

  it('GET /api/orgs/:orgId/students/:id returns student details', async () => {
    vi.mocked(getStudentById).mockResolvedValue({
      id: 'stu-1',
      orgId: 'org-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/students/stu-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('stu-1');
  });

  it('PATCH /api/orgs/:orgId/students/:id updates student', async () => {
    vi.mocked(getStudentById).mockResolvedValue({
      id: 'stu-1',
      orgId: 'org-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
    } as any);
    vi.mocked(updateStudent).mockResolvedValue({
      id: 'stu-1',
      orgId: 'org-1',
      firstName: 'Ada',
      lastName: 'Byron',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .patch('/api/orgs/org-1/students/stu-1')
      .set('Authorization', authHeader())
      .send({ lastName: 'Byron' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.lastName).toBe('Byron');
  });

  it('GET /api/orgs/:orgId/departments returns departments', async () => {
    vi.mocked(findCampusesByOrg).mockResolvedValue([
      { id: '11111111-1111-1111-1111-111111111111', orgId: 'org-1', name: 'Main' },
    ] as any);
    vi.mocked(listDepartmentsByCampus).mockResolvedValue([
      { id: 'dep-1', campusId: '11111111-1111-1111-1111-111111111111', name: 'Science', code: 'SCI' },
    ] as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/departments')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /api/orgs/:orgId/departments creates a department', async () => {
    vi.mocked(findCampusById).mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      orgId: 'org-1',
      name: 'Main',
    } as any);
    vi.mocked(createDepartment).mockResolvedValue({
      id: 'dep-1',
      campusId: '11111111-1111-1111-1111-111111111111',
      name: 'Science',
      code: 'SCI',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/departments')
      .set('Authorization', authHeader())
      .send({
        campusId: '11111111-1111-1111-1111-111111111111',
        name: 'Science',
        code: 'SCI',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('SCI');
  });

  it('POST /api/orgs/:orgId/courses creates a course', async () => {
    vi.mocked(findDepartmentById).mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      campusId: '11111111-1111-1111-1111-111111111111',
    } as any);
    vi.mocked(findCampusById).mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      orgId: 'org-1',
    } as any);
    vi.mocked(createCourse).mockResolvedValue({
      id: 'course-1',
      deptId: '22222222-2222-2222-2222-222222222222',
      name: 'Algorithms',
      code: 'CS101',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/courses')
      .set('Authorization', authHeader())
      .send({
        deptId: '22222222-2222-2222-2222-222222222222',
        name: 'Algorithms',
        code: 'CS101',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('CS101');
  });

  it('GET /api/orgs/:orgId/semesters returns semesters', async () => {
    vi.mocked(listSemestersByOrg).mockResolvedValue([
      { id: 'sem-1', orgId: 'org-1', name: 'Spring 2026' },
    ] as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/semesters')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /api/orgs/:orgId/semesters creates a semester', async () => {
    vi.mocked(createSemester).mockResolvedValue({
      id: 'sem-2',
      orgId: 'org-1',
      name: 'Fall 2026',
      startDate: '2026-09-01',
      endDate: '2026-12-15',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/semesters')
      .set('Authorization', authHeader({ roles: ['OpsManager'] }))
      .send({
        name: 'Fall 2026',
        startDate: '2026-09-01',
        endDate: '2026-12-15',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Fall 2026');
  });

  it('POST /api/orgs/:orgId/classes creates a class', async () => {
    vi.mocked(findCourseById).mockResolvedValue({
      id: '33333333-3333-3333-3333-333333333333',
      deptId: '22222222-2222-2222-2222-222222222222',
    } as any);
    vi.mocked(findSemesterById).mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      orgId: 'org-1',
    } as any);
    vi.mocked(findDepartmentById).mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      campusId: '11111111-1111-1111-1111-111111111111',
    } as any);
    vi.mocked(findCampusById).mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      orgId: 'org-1',
    } as any);
    vi.mocked(createClass).mockResolvedValue({
      id: 'class-1',
      courseId: '33333333-3333-3333-3333-333333333333',
      semesterId: '44444444-4444-4444-4444-444444444444',
      section: 'A',
      capacity: 40,
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/classes')
      .set('Authorization', authHeader())
      .send({
        courseId: '33333333-3333-3333-3333-333333333333',
        semesterId: '44444444-4444-4444-4444-444444444444',
        section: 'A',
        capacity: 40,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.section).toBe('A');
  });
});
