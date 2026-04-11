import { NotFoundError, ValidationError } from '../../common/errors/app-errors.js';
import { createStudentSchema } from './schemas.js';
import type { ImportRowValidationError } from './types.js';
import * as repo from './repository.js';

// ---- Students ----

export async function getStudentById(id: string) {
  const student = await repo.findStudentById(id);
  if (!student) throw new NotFoundError('Student not found');
  return student;
}

// ---- Import ----

/**
 * Validates and upserts student rows. Returns per-row validation errors.
 * Does not throw — collects all errors and returns them alongside success count.
 */
export async function importStudents(
  orgId: string,
  rows: Record<string, unknown>[],
): Promise<{ successCount: number; failedRows: ImportRowValidationError[] }> {
  let successCount = 0;
  const failedRows: ImportRowValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = rows[i];

    const parsed = createStudentSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      for (const [field, messages] of Object.entries(fieldErrors)) {
        failedRows.push({
          rowNumber,
          field,
          errorMessage: (messages as string[])[0] ?? 'Invalid value',
          rawValue: raw[field] !== undefined ? String(raw[field]) : null,
        });
      }
      continue;
    }

    try {
      await repo.upsertStudentByNumber(orgId, parsed.data);
      successCount++;
    } catch {
      failedRows.push({
        rowNumber,
        field: 'studentNumber',
        errorMessage: 'Failed to upsert student',
        rawValue: String(raw['studentNumber'] ?? ''),
      });
    }
  }

  return { successCount, failedRows };
}

/**
 * Validates and upserts class rows. Verifies courseId + semesterId exist.
 */
export async function importClasses(
  _orgId: string,
  rows: Record<string, unknown>[],
): Promise<{ successCount: number; failedRows: ImportRowValidationError[] }> {
  let successCount = 0;
  const failedRows: ImportRowValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = rows[i];

    const courseId = String(raw['courseId'] ?? '');
    const semesterId = String(raw['semesterId'] ?? '');
    const section = String(raw['section'] ?? '');

    if (!courseId) {
      failedRows.push({ rowNumber, field: 'courseId', errorMessage: 'courseId is required', rawValue: null });
      continue;
    }
    if (!semesterId) {
      failedRows.push({ rowNumber, field: 'semesterId', errorMessage: 'semesterId is required', rawValue: null });
      continue;
    }
    if (!section) {
      failedRows.push({ rowNumber, field: 'section', errorMessage: 'section is required', rawValue: null });
      continue;
    }

    const [course, semester] = await Promise.all([
      repo.findCourseById(courseId),
      repo.findSemesterById(semesterId),
    ]);

    if (!course) {
      failedRows.push({ rowNumber, field: 'courseId', errorMessage: 'Course not found', rawValue: courseId });
      continue;
    }
    if (!semester) {
      failedRows.push({ rowNumber, field: 'semesterId', errorMessage: 'Semester not found', rawValue: semesterId });
      continue;
    }

    try {
      await repo.createClass({
        courseId,
        semesterId,
        section,
        capacity: raw['capacity'] ? Number(raw['capacity']) : 30,
      });
      successCount++;
    } catch {
      failedRows.push({
        rowNumber,
        field: 'section',
        errorMessage: 'Failed to create class (may be duplicate)',
        rawValue: section,
      });
    }
  }

  return { successCount, failedRows };
}

/**
 * Validates and creates department rows. Returns per-row validation errors.
 */
export async function importDepartments(
  _orgId: string,
  rows: Record<string, unknown>[],
): Promise<{ successCount: number; failedRows: ImportRowValidationError[] }> {
  let successCount = 0;
  const failedRows: ImportRowValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = rows[i];
    const campusId = String(raw['campusId'] ?? '');
    const name = String(raw['name'] ?? '');
    const code = String(raw['code'] ?? '');

    if (!campusId) { failedRows.push({ rowNumber, field: 'campusId', errorMessage: 'campusId is required', rawValue: null }); continue; }
    if (!name) { failedRows.push({ rowNumber, field: 'name', errorMessage: 'name is required', rawValue: null }); continue; }
    if (!code) { failedRows.push({ rowNumber, field: 'code', errorMessage: 'code is required', rawValue: null }); continue; }

    try {
      await repo.createDepartment({ campusId, name, code });
      successCount++;
    } catch {
      failedRows.push({ rowNumber, field: 'code', errorMessage: 'Failed to create department (may be duplicate)', rawValue: code });
    }
  }

  return { successCount, failedRows };
}

/**
 * Validates and creates course rows. Verifies deptId exists.
 */
export async function importCourses(
  _orgId: string,
  rows: Record<string, unknown>[],
): Promise<{ successCount: number; failedRows: ImportRowValidationError[] }> {
  let successCount = 0;
  const failedRows: ImportRowValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = rows[i];
    const deptId = String(raw['deptId'] ?? '');
    const name = String(raw['name'] ?? '');
    const code = String(raw['code'] ?? '');

    if (!deptId) { failedRows.push({ rowNumber, field: 'deptId', errorMessage: 'deptId is required', rawValue: null }); continue; }
    if (!name) { failedRows.push({ rowNumber, field: 'name', errorMessage: 'name is required', rawValue: null }); continue; }
    if (!code) { failedRows.push({ rowNumber, field: 'code', errorMessage: 'code is required', rawValue: null }); continue; }

    const dept = await repo.findDepartmentById(deptId);
    if (!dept) { failedRows.push({ rowNumber, field: 'deptId', errorMessage: 'Department not found', rawValue: deptId }); continue; }

    try {
      await repo.createCourse({ deptId, name, code });
      successCount++;
    } catch {
      failedRows.push({ rowNumber, field: 'code', errorMessage: 'Failed to create course (may be duplicate)', rawValue: code });
    }
  }

  return { successCount, failedRows };
}

/**
 * Validates and creates semester rows.
 */
export async function importSemesters(
  orgId: string,
  rows: Record<string, unknown>[],
): Promise<{ successCount: number; failedRows: ImportRowValidationError[] }> {
  let successCount = 0;
  const failedRows: ImportRowValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = rows[i];
    const name = String(raw['name'] ?? '');
    const startDate = String(raw['startDate'] ?? '');
    const endDate = String(raw['endDate'] ?? '');

    if (!name) { failedRows.push({ rowNumber, field: 'name', errorMessage: 'name is required', rawValue: null }); continue; }
    if (!startDate) { failedRows.push({ rowNumber, field: 'startDate', errorMessage: 'startDate is required', rawValue: null }); continue; }
    if (!endDate) { failedRows.push({ rowNumber, field: 'endDate', errorMessage: 'endDate is required', rawValue: null }); continue; }

    try {
      await repo.createSemester(orgId, { name, startDate, endDate });
      successCount++;
    } catch {
      failedRows.push({ rowNumber, field: 'name', errorMessage: 'Failed to create semester', rawValue: name });
    }
  }

  return { successCount, failedRows };
}

// ---- Export ----

export async function exportStudents(orgId: string) {
  const { students } = await repo.listStudentsByOrg(orgId, { page: 1, limit: 10000, order: 'asc' });
  return students.map((s) => ({
    studentNumber: s.studentNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.email ?? '',
    enrolledAt: s.enrolledAt.toISOString(),
  }));
}

export async function exportDepartments(orgId: string) {
  const campuses = await repo.findCampusesByOrg(orgId);
  const deptArrays = await Promise.all(campuses.map((c) => repo.listDepartmentsByCampus(c.id)));
  return deptArrays.flat().map((d) => ({
    id: d.id,
    campusId: d.campusId,
    name: d.name,
    code: d.code,
  }));
}

export async function exportCourses(orgId: string) {
  const campuses = await repo.findCampusesByOrg(orgId);
  const deptArrays = await Promise.all(campuses.map((c) => repo.listDepartmentsByCampus(c.id)));
  const depts = deptArrays.flat();
  const courseArrays = await Promise.all(depts.map((d) => repo.listCoursesByDept(d.id)));
  return courseArrays.flat().map((c) => ({
    id: c.id,
    deptId: c.deptId,
    name: c.name,
    code: c.code,
    credits: c.credits,
  }));
}

export async function exportSemesters(orgId: string) {
  const semesters = await repo.listSemestersByOrg(orgId);
  return semesters.map((s) => ({
    id: s.id,
    name: s.name,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
  }));
}

export async function exportClasses(orgId: string) {
  const semesters = await repo.listSemestersByOrg(orgId);
  const classArrays = await Promise.all(semesters.map((s) => repo.listClassesBySemester(s.id)));
  return classArrays.flat().map((cls) => ({
    id: cls.id,
    courseId: cls.courseId,
    courseName: cls.course.name,
    semesterId: cls.semesterId,
    section: cls.section,
    capacity: cls.capacity,
  }));
}
