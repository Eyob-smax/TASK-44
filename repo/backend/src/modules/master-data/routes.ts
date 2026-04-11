import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'fs';
import { authenticate, enforceSameOrg, requireRole, requirePermission } from '../../common/middleware/auth.middleware.js';
import { validateBody } from '../../common/middleware/validate.js';
import { applyFieldMasking } from '../../common/middleware/field-masking.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import { config } from '../../app/config.js';
import {
  createStudentSchema,
  updateStudentSchema,
  createDepartmentSchema,
  createCourseSchema,
  createClassSchema,
  createSemesterSchema,
} from './schemas.js';
import * as ctrl from './controller.js';

const csvUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      mkdirSync(config.STORAGE_PATH, { recursive: true });
      cb(null, config.STORAGE_PATH);
    },
    filename(_req, _file, cb) {
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    cb(ok ? null : (new Error('Only CSV or XLSX files allowed') as unknown as null), ok);
  },
});

export const masterDataRouter = Router();

// Orgs
masterDataRouter.get('/', authenticate, ctrl.listOrgsHandler);
masterDataRouter.get('/:orgId', authenticate, enforceSameOrg, ctrl.getOrgHandler);
masterDataRouter.get('/:orgId/campuses', authenticate, enforceSameOrg, ctrl.listCampusesHandler);

// Students
masterDataRouter.get(
  '/:orgId/students',
  authenticate,
  enforceSameOrg,
  requirePermission('read', 'master-data'),
  applyFieldMasking('student'),
  ctrl.listStudentsHandler,
);
masterDataRouter.post(
  '/:orgId/students',
  authenticate,
  enforceSameOrg,
  requirePermission('write', 'master-data'),
  idempotency,
  validateBody(createStudentSchema),
  ctrl.createStudentHandler,
);
masterDataRouter.get(
  '/:orgId/students/:id',
  authenticate,
  enforceSameOrg,
  requirePermission('read', 'master-data'),
  applyFieldMasking('student'),
  ctrl.getStudentHandler,
);
masterDataRouter.patch(
  '/:orgId/students/:id',
  authenticate,
  enforceSameOrg,
  requirePermission('write', 'master-data'),
  idempotency,
  validateBody(updateStudentSchema),
  ctrl.updateStudentHandler,
);

// Departments
masterDataRouter.get(
  '/:orgId/departments',
  authenticate,
  enforceSameOrg,
  requirePermission('read', 'master-data'),
  ctrl.listDepartmentsHandler,
);
masterDataRouter.post(
  '/:orgId/departments',
  authenticate,
  enforceSameOrg,
  requirePermission('write', 'master-data'),
  idempotency,
  validateBody(createDepartmentSchema),
  ctrl.createDepartmentHandler,
);

// Courses
masterDataRouter.post(
  '/:orgId/courses',
  authenticate,
  enforceSameOrg,
  requirePermission('write', 'master-data'),
  idempotency,
  validateBody(createCourseSchema),
  ctrl.createCourseHandler,
);

// Semesters
masterDataRouter.get(
  '/:orgId/semesters',
  authenticate,
  enforceSameOrg,
  requirePermission('read', 'master-data'),
  ctrl.listSemestersHandler,
);
masterDataRouter.post(
  '/:orgId/semesters',
  authenticate,
  enforceSameOrg,
  requireRole('Administrator', 'OpsManager'),
  idempotency,
  validateBody(createSemesterSchema),
  ctrl.createSemesterHandler,
);

// Classes
masterDataRouter.post(
  '/:orgId/classes',
  authenticate,
  enforceSameOrg,
  requirePermission('write', 'master-data'),
  idempotency,
  validateBody(createClassSchema),
  ctrl.createClassHandler,
);

// Import / Export
masterDataRouter.post(
  '/:orgId/import',
  authenticate,
  enforceSameOrg,
  requireRole('Administrator', 'OpsManager'),
  idempotency,
  csvUpload.single('file'),
  ctrl.createImportJobHandler,
);
masterDataRouter.get(
  '/:orgId/import/:id',
  authenticate,
  enforceSameOrg,
  requireRole('Administrator', 'OpsManager'),
  ctrl.getImportJobHandler,
);
masterDataRouter.post(
  '/:orgId/export',
  authenticate,
  enforceSameOrg,
  requireRole('Administrator', 'OpsManager', 'Auditor'),
  idempotency,
  ctrl.createExportJobHandler,
);
masterDataRouter.get(
  '/:orgId/export/:id',
  authenticate,
  enforceSameOrg,
  requireRole('Administrator', 'OpsManager', 'Auditor'),
  ctrl.getExportJobHandler,
);
