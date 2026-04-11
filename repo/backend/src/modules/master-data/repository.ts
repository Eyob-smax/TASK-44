import { db } from '../../app/container.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-errors.js';
import type { PaginationParams } from '../../common/validation/schemas.js';
import type {
  CreateStudentRequest,
  UpdateStudentRequest,
  CreateDepartmentRequest,
  CreateCourseRequest,
  CreateClassRequest,
  CreateSemesterRequest,
} from './types.js';

// ---- Organizations ----

export async function findOrgById(id: string) {
  return db.organization.findUnique({ where: { id } });
}

export async function listOrgs(orgId?: string) {
  return db.organization.findMany({
    where: orgId ? { id: orgId } : {},
    orderBy: { name: 'asc' },
  });
}

export async function findCampusesByOrg(orgId: string) {
  return db.campus.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
}

export async function findCampusById(id: string) {
  return db.campus.findUnique({ where: { id } });
}

// ---- Students ----

export async function createStudent(orgId: string, data: CreateStudentRequest) {
  return db.student.create({
    data: {
      orgId,
      studentNumber: data.studentNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
    },
  });
}

export async function findStudentById(id: string) {
  return db.student.findUnique({ where: { id } });
}

export async function findStudentByNumber(orgId: string, studentNumber: string) {
  return db.student.findUnique({ where: { orgId_studentNumber: { orgId, studentNumber } } });
}

export async function listStudentsByOrg(orgId: string, pagination: PaginationParams) {
  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  const [students, total] = await Promise.all([
    db.student.findMany({
      where: { orgId },
      skip,
      take: limit,
      orderBy: { lastName: 'asc' },
    }),
    db.student.count({ where: { orgId } }),
  ]);

  return { students, total };
}

export async function updateStudent(id: string, data: UpdateStudentRequest) {
  return db.student.update({
    where: { id },
    data: {
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName }),
      ...(data.email !== undefined && { email: data.email }),
    },
  });
}

export async function upsertStudentByNumber(
  orgId: string,
  data: CreateStudentRequest,
) {
  return db.student.upsert({
    where: { orgId_studentNumber: { orgId, studentNumber: data.studentNumber } },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
    },
    create: {
      orgId,
      studentNumber: data.studentNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
    },
  });
}

// ---- Departments ----

export async function createDepartment(data: CreateDepartmentRequest) {
  return db.department.create({
    data: {
      campusId: data.campusId,
      name: data.name,
      code: data.code,
    },
  });
}

export async function findDepartmentById(id: string) {
  return db.department.findUnique({ where: { id } });
}

export async function listDepartmentsByCampus(campusId: string) {
  return db.department.findMany({ where: { campusId }, orderBy: { name: 'asc' } });
}

// ---- Courses ----

export async function createCourse(data: CreateCourseRequest) {
  return db.course.create({
    data: {
      deptId: data.deptId,
      name: data.name,
      code: data.code,
      credits: data.credits ?? 3,
    },
  });
}

export async function findCourseById(id: string) {
  return db.course.findUnique({ where: { id } });
}

export async function listCoursesByDept(deptId: string) {
  return db.course.findMany({ where: { deptId }, orderBy: { name: 'asc' } });
}

// ---- Semesters ----

export async function createSemester(orgId: string, data: CreateSemesterRequest) {
  return db.semester.create({
    data: {
      orgId,
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    },
  });
}

export async function findSemesterById(id: string) {
  return db.semester.findUnique({ where: { id } });
}

export async function listSemestersByOrg(orgId: string) {
  return db.semester.findMany({ where: { orgId }, orderBy: { startDate: 'desc' } });
}

// ---- Classes ----

export async function createClass(data: CreateClassRequest) {
  return db.class.create({
    data: {
      courseId: data.courseId,
      semesterId: data.semesterId,
      section: data.section,
      capacity: data.capacity ?? 30,
    },
  });
}

export async function findClassById(id: string) {
  return db.class.findUnique({ where: { id } });
}

export async function listClassesBySemester(semesterId: string) {
  return db.class.findMany({
    where: { semesterId },
    include: { course: true },
    orderBy: { course: { name: 'asc' } },
  });
}

// ---- Enrollments ----

export async function enrollStudent(classId: string, studentId: string) {
  const existing = await db.classEnrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });

  if (existing) {
    throw new ConflictError('Student is already enrolled in this class');
  }

  return db.classEnrollment.create({
    data: { classId, studentId },
  });
}

export async function listEnrollmentsByClass(classId: string) {
  return db.classEnrollment.findMany({
    where: { classId },
    include: { student: true },
    orderBy: { student: { lastName: 'asc' } },
  });
}

// ---- Import jobs ----

export async function createImportJob(data: {
  entityType: string;
  fileName: string;
  createdByUserId: string;
}) {
  return db.importJob.create({
    data: {
      entityType: data.entityType,
      fileName: data.fileName,
      createdByUserId: data.createdByUserId,
      status: 'pending',
    },
  });
}

export async function updateImportJob(
  id: string,
  data: {
    status?: string;
    totalRows?: number;
    successRows?: number;
    failedRows?: number;
    errorReportAssetId?: string;
    startedAt?: Date;
    completedAt?: Date;
  },
) {
  return db.importJob.update({ where: { id }, data });
}

export async function createImportRowError(data: {
  importJobId: string;
  rowNumber: number;
  field: string;
  errorMessage: string;
  rawValue?: string | null;
}) {
  return db.importRowError.create({ data });
}

export async function findImportJobById(id: string) {
  return db.importJob.findUnique({
    where: { id },
    include: {
      rowErrors: true,
      createdBy: { select: { orgId: true } },
    },
  });
}

// ---- Export jobs ----

export async function createExportJob(data: {
  entityType: string;
  format: string;
  createdByUserId: string;
}) {
  return db.exportJob.create({
    data: {
      entityType: data.entityType,
      format: data.format,
      createdByUserId: data.createdByUserId,
      status: 'pending',
    },
  });
}

export async function updateExportJob(
  id: string,
  data: {
    status?: string;
    fileAssetId?: string;
    startedAt?: Date;
    completedAt?: Date;
  },
) {
  return db.exportJob.update({ where: { id }, data });
}

export async function findExportJobById(id: string) {
  return db.exportJob.findUnique({
    where: { id },
    include: {
      createdBy: { select: { orgId: true } },
    },
  });
}

// ---- File assets ----

export async function createFileAsset(data: {
  originalName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string;
}) {
  return db.fileAsset.create({ data });
}
