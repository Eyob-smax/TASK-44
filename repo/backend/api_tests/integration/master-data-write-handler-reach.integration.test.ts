import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { masterDataRouter } from '../../src/modules/master-data/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `master-data-write-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-master-data-write-int';

let orgId = '';
let campusId = '';
let userId = '';
let studentId = '';
let departmentId = '';
let courseId = '';
let semesterId = '';
let classId = '';

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
      username: `master-data-user-${RUN_ID}`,
      roles: ['Administrator', 'OpsManager'],
      permissions: ['read:master-data:*', 'write:master-data:*'],
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
  app.use('/api/orgs', masterDataRouter);
  app.use(errorHandler);
  return app;
}

describe('No-mock HTTP integration: master-data write handler reach', () => {
  beforeAll(async () => {
    const org = await db.organization.create({
      data: {
        name: `MasterData Org ${RUN_ID}`,
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

    const user = await db.user.create({
      data: {
        username: `master-data-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'Master Data Integration User',
        isActive: true,
        orgId,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (classId) await db.class.deleteMany({ where: { id: classId } });
    if (courseId) await db.course.deleteMany({ where: { id: courseId } });
    if (semesterId) await db.semester.deleteMany({ where: { id: semesterId } });
    if (departmentId) await db.department.deleteMany({ where: { id: departmentId } });
    if (studentId) await db.student.deleteMany({ where: { id: studentId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    if (campusId) await db.campus.deleteMany({ where: { id: campusId } });
    if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
  });

  it('GET org and campus endpoints reach handlers', async () => {
    const app = buildApp();

    const orgsRes = await request(app)
      .get('/api/orgs')
      .set('Authorization', authHeader());
    expect(orgsRes.status).toBe(200);
    expect(orgsRes.body.success).toBe(true);

    const orgRes = await request(app)
      .get(`/api/orgs/${orgId}`)
      .set('Authorization', authHeader());
    expect(orgRes.status).toBe(200);
    expect(orgRes.body.data.id).toBe(orgId);

    const campusesRes = await request(app)
      .get(`/api/orgs/${orgId}/campuses`)
      .set('Authorization', authHeader());
    expect(campusesRes.status).toBe(200);
    expect(Array.isArray(campusesRes.body.data)).toBe(true);
  });

  it('creates and reads student via HTTP handlers', async () => {
    const app = buildApp();

    const createRes = await request(app)
      .post(`/api/orgs/${orgId}/students`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `md-student-${RUN_ID}`)
      .send({
        studentNumber: `STU-${RUN_ID}`,
        firstName: 'Jane',
        lastName: 'Doe',
        email: `jane.${RUN_ID}@example.com`,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    studentId = createRes.body.data.id as string;

    const listRes = await request(app)
      .get(`/api/orgs/${orgId}/students`)
      .set('Authorization', authHeader());
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data.students)).toBe(true);

    const getRes = await request(app)
      .get(`/api/orgs/${orgId}/students/${studentId}`)
      .set('Authorization', authHeader());
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(studentId);

    const patchRes = await request(app)
      .patch(`/api/orgs/${orgId}/students/${studentId}`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `md-student-patch-${RUN_ID}`)
      .send({ firstName: 'Janet' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.firstName).toBe('Janet');
  });

  it('creates department, course, semester, and class via HTTP handlers', async () => {
    const app = buildApp();

    const deptRes = await request(app)
      .post(`/api/orgs/${orgId}/departments`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `md-dept-${RUN_ID}`)
      .send({
        campusId,
        name: `Department ${RUN_ID}`,
        code: `DEP-${String(RUN_ID).slice(-6)}`,
      });
    expect(deptRes.status).toBe(201);
    departmentId = deptRes.body.data.id as string;

    const deptsListRes = await request(app)
      .get(`/api/orgs/${orgId}/departments`)
      .set('Authorization', authHeader());
    expect(deptsListRes.status).toBe(200);

    const courseRes = await request(app)
      .post(`/api/orgs/${orgId}/courses`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `md-course-${RUN_ID}`)
      .send({
        deptId: departmentId,
        name: `Course ${RUN_ID}`,
        code: `CRS-${String(RUN_ID).slice(-6)}`,
        credits: 3,
      });
    expect(courseRes.status).toBe(201);
    courseId = courseRes.body.data.id as string;

    const semRes = await request(app)
      .post(`/api/orgs/${orgId}/semesters`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `md-semester-${RUN_ID}`)
      .send({
        name: `Semester ${RUN_ID}`,
        startDate: '2026-01-10',
        endDate: '2026-06-10',
      });
    expect(semRes.status).toBe(201);
    semesterId = semRes.body.data.id as string;

    const semListRes = await request(app)
      .get(`/api/orgs/${orgId}/semesters`)
      .set('Authorization', authHeader());
    expect(semListRes.status).toBe(200);

    const classRes = await request(app)
      .post(`/api/orgs/${orgId}/classes`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `md-class-${RUN_ID}`)
      .send({
        courseId,
        semesterId,
        section: `A-${String(RUN_ID).slice(-4)}`,
        capacity: 35,
      });
    expect(classRes.status).toBe(201);
    classId = classRes.body.data.id as string;
  });

  it('import/export handlers are reached without mocks', async () => {
    const app = buildApp();

    const importRes = await request(app)
      .post(`/api/orgs/${orgId}/import`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `md-import-${RUN_ID}`)
      .field('entityType', 'students');

    expect(importRes.status).toBe(400);
    expect(importRes.body.error?.code).toBe('VALIDATION_ERROR');

    const getImportRes = await request(app)
      .get(`/api/orgs/${orgId}/import/00000000-0000-0000-0000-000000000001`)
      .set('Authorization', authHeader());
    expect(getImportRes.status).toBe(404);

    const exportRes = await request(app)
      .post(`/api/orgs/${orgId}/export`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `md-export-${RUN_ID}`)
      .send({ entityType: 'invalid-type' });

    expect(exportRes.status).toBe(400);
    expect(exportRes.body.error?.code).toBe('VALIDATION_ERROR');

    const getExportRes = await request(app)
      .get(`/api/orgs/${orgId}/export/00000000-0000-0000-0000-000000000002`)
      .set('Authorization', authHeader());
    expect(getExportRes.status).toBe(404);
  });
});
