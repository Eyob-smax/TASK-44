import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { masterDataRouter } from '../src/modules/master-data/routes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';

vi.mock('../src/modules/master-data/repository.js', () => ({
  findOrgById: vi.fn(),
  listOrgs: vi.fn().mockResolvedValue([]),
  findCampusesByOrg: vi.fn().mockResolvedValue([]),
  createStudent: vi.fn(),
  findStudentById: vi.fn(),
  listStudentsByOrg: vi.fn().mockResolvedValue({ students: [], total: 0 }),
  updateStudent: vi.fn(),
  findStudentByNumber: vi.fn(),
  upsertStudentByNumber: vi.fn(),
  listDepartmentsByCampus: vi.fn().mockResolvedValue([]),
  createDepartment: vi.fn(),
  createCourse: vi.fn(),
  listSemestersByOrg: vi.fn().mockResolvedValue([]),
  createSemester: vi.fn(),
  createClass: vi.fn(),
  enrollStudent: vi.fn(),
  createImportJob: vi.fn(),
  findImportJobById: vi.fn(),
  createExportJob: vi.fn(),
  findExportJobById: vi.fn(),
  createFileAsset: vi.fn(),
  updateImportJob: vi.fn(),
  updateExportJob: vi.fn(),
}));

vi.mock('../src/modules/master-data/service.js', () => ({
  importStudents: vi.fn(),
  importClasses: vi.fn(),
  importDepartments: vi.fn(),
  importCourses: vi.fn(),
  importSemesters: vi.fn(),
  exportStudents: vi.fn(),
  exportClasses: vi.fn(),
  exportDepartments: vi.fn(),
  exportCourses: vi.fn(),
  exportSemesters: vi.fn(),
  getStudentById: vi.fn(),
}));

vi.mock('../src/jobs/job-monitor.js', () => ({
  enqueueJob: vi.fn().mockResolvedValue('bg-job-1'),
  claimNextJob: vi.fn(),
  markJobCompleted: vi.fn(),
  markJobFailed: vi.fn(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    fileAsset: {
      create: vi.fn().mockResolvedValue({ id: 'asset-created-1' }),
    },
  },
}));

vi.mock('../src/common/middleware/idempotency.js', () => ({
  idempotency: (_req: any, _res: any, next: any) => next(),
}));

const { createImportJob, findImportJobById, createExportJob, findExportJobById } = await import('../src/modules/master-data/repository.js');
const { enqueueJob } = await import('../src/jobs/job-monitor.js');
const { db } = await import('../src/app/container.js');

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
      username: 'admin',
      roles: ['Administrator'],
      permissions: ['write:students:*', 'read:students:*'],
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

const csvBuffer = Buffer.from('name,studentNumber\nAlice,S001\nBob,S002');

describe('POST /api/orgs/:orgId/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.fileAsset.create).mockResolvedValue({ id: 'asset-created-1' } as any);
  });

  it('returns 202 with importJobId, jobId, and fileAssetId', async () => {
    vi.mocked(createImportJob).mockResolvedValue({
      id: 'import-job-1',
      entityType: 'students',
      status: 'pending',
      fileName: 'students-import.csv',
      createdByUserId: 'user-1',
    } as any);
    vi.mocked(enqueueJob).mockResolvedValue('bg-job-1');

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/import')
      .set('Authorization', authHeader())
      .attach('file', csvBuffer, { filename: 'students-import.csv', contentType: 'text/csv' })
      .field('entityType', 'students');

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.importJobId).toBe('import-job-1');
    expect(res.body.data.jobId).toBe('bg-job-1');
    expect(res.body.data.fileAssetId).toBe('asset-created-1');
  });

  it('returns 400 VALIDATION_ERROR when no file is uploaded', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/import')
      .set('Authorization', authHeader())
      .field('entityType', 'students');

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for invalid entityType', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/import')
      .set('Authorization', authHeader())
      .attach('file', csvBuffer, { filename: 'data.csv', contentType: 'text/csv' })
      .field('entityType', 'invalid-type');

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('accepts entityType departments', async () => {
    vi.mocked(createImportJob).mockResolvedValue({
      id: 'import-job-dept-1',
      entityType: 'departments',
      status: 'pending',
      fileName: 'departments-import.csv',
      createdByUserId: 'user-1',
    } as any);
    vi.mocked(enqueueJob).mockResolvedValue('bg-job-dept-1');

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/import')
      .set('Authorization', authHeader())
      .attach('file', csvBuffer, { filename: 'departments-import.csv', contentType: 'text/csv' })
      .field('entityType', 'departments');

    expect(res.status).toBe(202);
    expect(res.body.data.importJobId).toBe('import-job-dept-1');
  });

  it('enqueues job with fileAssetId in payload', async () => {
    vi.mocked(createImportJob).mockResolvedValue({
      id: 'import-job-2',
      entityType: 'classes',
      status: 'pending',
      fileName: 'classes.csv',
      createdByUserId: 'user-1',
    } as any);
    vi.mocked(enqueueJob).mockResolvedValue('bg-job-2');

    const app = buildApp();
    await request(app)
      .post('/api/orgs/org-1/import')
      .set('Authorization', authHeader())
      .attach('file', csvBuffer, { filename: 'classes.csv', contentType: 'text/csv' })
      .field('entityType', 'classes');

    expect(enqueueJob).toHaveBeenCalledWith('import', {
      importJobId: 'import-job-2',
      orgId: 'org-1',
      entityType: 'classes',
      fileAssetId: 'asset-created-1',
    });
  });
});

describe('GET /api/orgs/:orgId/import/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns import job with failedRows > 0 and errorReportAssetId when rows fail', async () => {
    vi.mocked(findImportJobById).mockResolvedValue({
      id: 'import-job-3',
      entityType: 'students',
      status: 'partial_success',
      successRows: 8,
      failedRows: 2,
      errorReportAssetId: 'asset-error-1',
      completedAt: new Date(),
      createdBy: { orgId: 'org-1' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/import/import-job-3')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.failedRows).toBe(2);
    expect(res.body.data.errorReportAssetId).toBe('asset-error-1');
  });

  it('returns 404 when import job not found', async () => {
    vi.mocked(findImportJobById).mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/import/nonexistent')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
  });

  it('returns 404 when import job belongs to a different org', async () => {
    vi.mocked(findImportJobById).mockResolvedValue({
      id: 'import-job-foreign',
      entityType: 'students',
      status: 'completed',
      failedRows: 0,
      successRows: 10,
      createdBy: { orgId: 'org-2' },
      completedAt: new Date(),
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/import/import-job-foreign')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/orgs/:orgId/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 202 with exportJobId and jobId', async () => {
    vi.mocked(createExportJob).mockResolvedValue({
      id: 'export-job-1',
      entityType: 'students',
      format: 'csv',
      status: 'pending',
      createdByUserId: 'user-1',
    } as any);
    vi.mocked(enqueueJob).mockResolvedValue('bg-job-3');

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/export')
      .set('Authorization', authHeader())
      .send({ entityType: 'students', format: 'csv' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exportJobId).toBe('export-job-1');
    expect(res.body.data.jobId).toBe('bg-job-3');
  });

  it('returns 400 VALIDATION_ERROR for invalid entityType', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/export')
      .set('Authorization', authHeader())
      .send({ entityType: 'transactions' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('accepts entityType semesters', async () => {
    vi.mocked(createExportJob).mockResolvedValue({
      id: 'export-job-sem-1',
      entityType: 'semesters',
      format: 'csv',
      status: 'pending',
      createdByUserId: 'user-1',
    } as any);
    vi.mocked(enqueueJob).mockResolvedValue('bg-job-sem-1');

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/export')
      .set('Authorization', authHeader())
      .send({ entityType: 'semesters' });

    expect(res.status).toBe(202);
    expect(res.body.data.exportJobId).toBe('export-job-sem-1');
  });
});

describe('GET /api/orgs/:orgId/export/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns completed export job with fileAssetId set', async () => {
    vi.mocked(findExportJobById).mockResolvedValue({
      id: 'export-job-1',
      entityType: 'students',
      format: 'csv',
      status: 'completed',
      fileAssetId: 'asset-export-1',
      completedAt: new Date(),
      createdBy: { orgId: 'org-1' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/export/export-job-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.fileAssetId).toBe('asset-export-1');
  });

  it('returns export job in processing state with null fileAssetId', async () => {
    vi.mocked(findExportJobById).mockResolvedValue({
      id: 'export-job-2',
      entityType: 'students',
      format: 'csv',
      status: 'processing',
      fileAssetId: null,
      completedAt: null,
      createdBy: { orgId: 'org-1' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/export/export-job-2')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('processing');
    expect(res.body.data.fileAssetId).toBeNull();
  });

  it('returns 404 when export job belongs to a different org', async () => {
    vi.mocked(findExportJobById).mockResolvedValue({
      id: 'export-job-foreign',
      entityType: 'students',
      format: 'csv',
      status: 'completed',
      fileAssetId: 'asset-foreign',
      createdBy: { orgId: 'org-2' },
      completedAt: new Date(),
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/orgs/org-1/export/export-job-foreign')
      .set('Authorization', authHeader({ orgId: 'org-1' }));

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});
