import { Request, Response, NextFunction } from 'express';
import { enqueueJob } from '../../jobs/job-monitor.js';
import { NotFoundError, ValidationError } from '../../common/errors/app-errors.js';
import { db } from '../../app/container.js';
import * as repo from './repository.js';
import * as service from './service.js';

// ---- Orgs ----

export async function listOrgsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const isAdministrator = req.user?.roles.includes('Administrator') ?? false;
    const orgId = isAdministrator ? undefined : req.user?.orgId;
    const orgs = await repo.listOrgs(orgId);
    res.json({ success: true, data: orgs });
  } catch (err) { next(err); }
}

export async function getOrgHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const org = await repo.findOrgById(req.params.orgId);
    if (!org) throw new NotFoundError('Organization not found');
    res.json({ success: true, data: org });
  } catch (err) { next(err); }
}

export async function listCampusesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const campuses = await repo.findCampusesByOrg(req.params.orgId);
    res.json({ success: true, data: campuses });
  } catch (err) { next(err); }
}

// ---- Students ----

export async function listStudentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query['page']) || 1;
    const limit = Number(req.query['limit']) || 25;
    const { students, total } = await repo.listStudentsByOrg(req.params.orgId, { page, limit, order: 'asc' });
    res.json({ success: true, data: { students, total } });
  } catch (err) { next(err); }
}

export async function getStudentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const student = await service.getStudentById(req.params.id);
    if (student.orgId !== req.params.orgId) throw new NotFoundError('Student not found');
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
}

export async function createStudentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const student = await repo.createStudent(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: student });
  } catch (err) { next(err); }
}

export async function updateStudentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await service.getStudentById(req.params.id);
    if (existing.orgId !== req.params.orgId) throw new NotFoundError('Student not found');
    const student = await repo.updateStudent(req.params.id, req.body);
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
}

// ---- Departments ----

export async function listDepartmentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const campuses = await repo.findCampusesByOrg(req.params.orgId);
    const campusIds = campuses.map((c) => c.id);
    const depts = await Promise.all(campusIds.map((cid) => repo.listDepartmentsByCampus(cid)));
    res.json({ success: true, data: depts.flat() });
  } catch (err) { next(err); }
}

export async function createDepartmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const campus = await repo.findCampusById(req.body.campusId);
    if (!campus || campus.orgId !== req.params.orgId) {
      throw new NotFoundError('Campus not found');
    }
    const dept = await repo.createDepartment(req.body);
    res.status(201).json({ success: true, data: dept });
  } catch (err) { next(err); }
}

// ---- Courses ----

export async function createCourseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dept = await repo.findDepartmentById(req.body.deptId);
    if (!dept) throw new NotFoundError('Department not found');

    const campus = await repo.findCampusById(dept.campusId);
    if (!campus || campus.orgId !== req.params.orgId) {
      throw new NotFoundError('Department not found');
    }

    const course = await repo.createCourse(req.body);
    res.status(201).json({ success: true, data: course });
  } catch (err) { next(err); }
}

// ---- Semesters ----

export async function listSemestersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const semesters = await repo.listSemestersByOrg(req.params.orgId);
    res.json({ success: true, data: semesters });
  } catch (err) { next(err); }
}

export async function createSemesterHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const semester = await repo.createSemester(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: semester });
  } catch (err) { next(err); }
}

// ---- Classes ----

export async function createClassHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const [course, semester] = await Promise.all([
      repo.findCourseById(req.body.courseId),
      repo.findSemesterById(req.body.semesterId),
    ]);

    if (!course) throw new NotFoundError('Course not found');
    if (!semester || semester.orgId !== req.params.orgId) {
      throw new NotFoundError('Semester not found');
    }

    const dept = await repo.findDepartmentById(course.deptId);
    if (!dept) throw new NotFoundError('Department not found');

    const campus = await repo.findCampusById(dept.campusId);
    if (!campus || campus.orgId !== req.params.orgId) {
      throw new NotFoundError('Course not found');
    }

    const cls = await repo.createClass(req.body);
    res.status(201).json({ success: true, data: cls });
  } catch (err) { next(err); }
}

// ---- Enrollments ----

export async function enrollStudentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const enrollment = await repo.enrollStudent(req.params.classId, req.body.studentId);
    res.status(201).json({ success: true, data: enrollment });
  } catch (err) { next(err); }
}

// ---- Import ----

export async function createImportJobHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new ValidationError('File is required', { file: ['A CSV or XLSX file must be uploaded'] });
    }

    const { entityType } = req.body as { entityType: string };
    const allowedEntityTypes = ['students', 'classes', 'departments', 'courses', 'semesters'];
    if (!allowedEntityTypes.includes(entityType)) {
      throw new ValidationError('Invalid entityType', {
        entityType: [`Must be one of: ${allowedEntityTypes.join(', ')}`],
      });
    }

    const asset = await db.fileAsset.create({
      data: {
        originalName: req.file.originalname,
        storagePath: req.file.path,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedByUserId: req.user!.userId,
      },
    });

    const importJob = await repo.createImportJob({
      entityType,
      fileName: req.file.originalname,
      createdByUserId: req.user!.userId,
    });

    const jobId = await enqueueJob('import', {
      importJobId: importJob.id,
      orgId: req.params.orgId,
      entityType,
      fileAssetId: asset.id,
    });

    res.status(202).json({ success: true, data: { importJobId: importJob.id, jobId, fileAssetId: asset.id } });
  } catch (err) { next(err); }
}

export async function getImportJobHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await repo.findImportJobById(req.params.id);
    if (!job) throw new NotFoundError('Import job not found');
    if (req.user!.orgId && job.createdBy.orgId !== req.user!.orgId) {
      throw new NotFoundError('Import job not found');
    }
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
}

// ---- Export ----

export async function createExportJobHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { entityType, format = 'csv' } = req.body as { entityType: string; format?: string };
    const allowedEntityTypes = ['students', 'classes', 'departments', 'courses', 'semesters'];
    if (!allowedEntityTypes.includes(entityType)) {
      throw new ValidationError('Invalid entityType', {
        entityType: [`Must be one of: ${allowedEntityTypes.join(', ')}`],
      });
    }

    const exportJob = await repo.createExportJob({
      entityType,
      format,
      createdByUserId: req.user!.userId,
    });

    const jobId = await enqueueJob('export', {
      exportJobId: exportJob.id,
      orgId: req.params.orgId,
      entityType,
      format,
    });

    res.status(202).json({ success: true, data: { exportJobId: exportJob.id, jobId } });
  } catch (err) { next(err); }
}

export async function getExportJobHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await repo.findExportJobById(req.params.id);
    if (!job) throw new NotFoundError('Export job not found');
    if (req.user!.orgId && job.createdBy.orgId !== req.user!.orgId) {
      throw new NotFoundError('Export job not found');
    }
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
}
