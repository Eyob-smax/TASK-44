import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Repository mocks ----
const mockRepo = {
  findStudentById: vi.fn(),
  upsertStudentByNumber: vi.fn(),
  findCourseById: vi.fn(),
  findSemesterById: vi.fn(),
  findDepartmentById: vi.fn(),
  createClass: vi.fn(),
  createDepartment: vi.fn(),
  createCourse: vi.fn(),
  createSemester: vi.fn(),
  listStudentsByOrg: vi.fn(),
  findCampusesByOrg: vi.fn(),
  listDepartmentsByCampus: vi.fn(),
  listCoursesByDept: vi.fn(),
  listSemestersByOrg: vi.fn(),
  listClassesBySemester: vi.fn(),
};

vi.mock('../src/modules/master-data/repository.js', () => mockRepo);

// container/db is required transitively but unused once repo is mocked
vi.mock('../src/app/container.js', () => ({ db: {} }));

const service = await import('../src/modules/master-data/service.js');

const ORG = 'org-1';

beforeEach(() => vi.clearAllMocks());

// ============================================================================
// getStudentById
// ============================================================================

describe('getStudentById', () => {
  it('returns the student when found', async () => {
    mockRepo.findStudentById.mockResolvedValue({ id: 'stu-1', firstName: 'Ada' });
    await expect(service.getStudentById('stu-1')).resolves.toMatchObject({ id: 'stu-1' });
  });

  it('throws NotFoundError when student does not exist', async () => {
    mockRepo.findStudentById.mockResolvedValue(null);
    await expect(service.getStudentById('missing')).rejects.toThrow(/Student not found/);
  });
});

// ============================================================================
// importStudents
// ============================================================================

describe('importStudents', () => {
  it('upserts every valid row and reports successCount', async () => {
    mockRepo.upsertStudentByNumber.mockResolvedValue({});
    const result = await service.importStudents(ORG, [
      { studentNumber: 'S1', firstName: 'Ada', lastName: 'Lovelace' },
      { studentNumber: 'S2', firstName: 'Grace', lastName: 'Hopper' },
    ]);
    expect(result.successCount).toBe(2);
    expect(result.failedRows).toHaveLength(0);
    expect(mockRepo.upsertStudentByNumber).toHaveBeenCalledTimes(2);
  });

  it('emits one failedRow per missing required field via Zod', async () => {
    const result = await service.importStudents(ORG, [
      { firstName: 'Ada', lastName: 'Lovelace' }, // missing studentNumber
    ]);
    expect(result.successCount).toBe(0);
    expect(result.failedRows.length).toBeGreaterThan(0);
    expect(result.failedRows[0].rowNumber).toBe(1);
    expect(result.failedRows[0].field).toBe('studentNumber');
  });

  it('captures repository upsert errors as failedRows', async () => {
    mockRepo.upsertStudentByNumber.mockRejectedValueOnce(new Error('DB unique violation'));
    const result = await service.importStudents(ORG, [
      { studentNumber: 'S1', firstName: 'Ada', lastName: 'Lovelace' },
    ]);
    expect(result.successCount).toBe(0);
    expect(result.failedRows[0]).toMatchObject({
      field: 'studentNumber',
      errorMessage: expect.stringMatching(/Failed to upsert/),
      rawValue: 'S1',
    });
  });

  it('mixes valid and invalid rows in a single batch', async () => {
    mockRepo.upsertStudentByNumber.mockResolvedValue({});
    const result = await service.importStudents(ORG, [
      { studentNumber: 'S1', firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Bad' }, // invalid
      { studentNumber: 'S3', firstName: 'Grace', lastName: 'Hopper' },
    ]);
    expect(result.successCount).toBe(2);
    expect(result.failedRows.some((r) => r.rowNumber === 2)).toBe(true);
  });

  it('marks raw value as null when failing field is absent from the row', async () => {
    const result = await service.importStudents(ORG, [
      { firstName: 'Ada', lastName: 'Lovelace' }, // studentNumber missing
    ]);
    const studentNumberFailure = result.failedRows.find((r) => r.field === 'studentNumber');
    expect(studentNumberFailure?.rawValue).toBeNull();
  });
});

// ============================================================================
// importClasses
// ============================================================================

describe('importClasses', () => {
  it('flags missing courseId / semesterId / section before any DB lookup', async () => {
    const result = await service.importClasses(ORG, [
      { semesterId: 'sem-1', section: 'A' },          // no courseId
      { courseId: 'crs-1', section: 'A' },            // no semesterId
      { courseId: 'crs-1', semesterId: 'sem-1' },     // no section
    ]);
    expect(result.successCount).toBe(0);
    expect(result.failedRows.map((r) => r.field)).toEqual(['courseId', 'semesterId', 'section']);
    expect(mockRepo.findCourseById).not.toHaveBeenCalled();
    expect(mockRepo.findSemesterById).not.toHaveBeenCalled();
  });

  it('flags row when course does not exist', async () => {
    mockRepo.findCourseById.mockResolvedValue(null);
    mockRepo.findSemesterById.mockResolvedValue({ id: 'sem-1' });

    const result = await service.importClasses(ORG, [
      { courseId: 'missing-course', semesterId: 'sem-1', section: 'A' },
    ]);
    expect(result.successCount).toBe(0);
    expect(result.failedRows[0]).toMatchObject({ field: 'courseId', rawValue: 'missing-course' });
  });

  it('flags row when semester does not exist', async () => {
    mockRepo.findCourseById.mockResolvedValue({ id: 'crs-1' });
    mockRepo.findSemesterById.mockResolvedValue(null);

    const result = await service.importClasses(ORG, [
      { courseId: 'crs-1', semesterId: 'missing-sem', section: 'A' },
    ]);
    expect(result.failedRows[0]).toMatchObject({ field: 'semesterId', rawValue: 'missing-sem' });
  });

  it('creates class with default capacity 30 when capacity is omitted', async () => {
    mockRepo.findCourseById.mockResolvedValue({ id: 'crs-1' });
    mockRepo.findSemesterById.mockResolvedValue({ id: 'sem-1' });
    mockRepo.createClass.mockResolvedValue({});

    await service.importClasses(ORG, [
      { courseId: 'crs-1', semesterId: 'sem-1', section: 'A' },
    ]);
    expect(mockRepo.createClass).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: 30, section: 'A' }),
    );
  });

  it('honors explicit capacity when provided', async () => {
    mockRepo.findCourseById.mockResolvedValue({ id: 'crs-1' });
    mockRepo.findSemesterById.mockResolvedValue({ id: 'sem-1' });
    mockRepo.createClass.mockResolvedValue({});

    await service.importClasses(ORG, [
      { courseId: 'crs-1', semesterId: 'sem-1', section: 'B', capacity: '125' },
    ]);
    expect(mockRepo.createClass).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: 125 }),
    );
  });

  it('captures duplicate-class errors at the section field', async () => {
    mockRepo.findCourseById.mockResolvedValue({ id: 'crs-1' });
    mockRepo.findSemesterById.mockResolvedValue({ id: 'sem-1' });
    mockRepo.createClass.mockRejectedValue(new Error('UNIQUE constraint'));

    const result = await service.importClasses(ORG, [
      { courseId: 'crs-1', semesterId: 'sem-1', section: 'A' },
    ]);
    expect(result.failedRows[0]).toMatchObject({ field: 'section', rawValue: 'A' });
  });
});

// ============================================================================
// importDepartments
// ============================================================================

describe('importDepartments', () => {
  it('flags missing campusId / name / code', async () => {
    const result = await service.importDepartments(ORG, [
      { name: 'Ops', code: 'OPS' },                   // no campusId
      { campusId: 'cmp-1', code: 'OPS' },             // no name
      { campusId: 'cmp-1', name: 'Ops' },             // no code
    ]);
    expect(result.failedRows.map((r) => r.field)).toEqual(['campusId', 'name', 'code']);
    expect(mockRepo.createDepartment).not.toHaveBeenCalled();
  });

  it('creates department when all fields are present', async () => {
    mockRepo.createDepartment.mockResolvedValue({});
    const result = await service.importDepartments(ORG, [
      { campusId: 'cmp-1', name: 'Operations', code: 'OPS' },
    ]);
    expect(result.successCount).toBe(1);
    expect(mockRepo.createDepartment).toHaveBeenCalledWith({
      campusId: 'cmp-1',
      name: 'Operations',
      code: 'OPS',
    });
  });

  it('captures duplicate-department errors at the code field', async () => {
    mockRepo.createDepartment.mockRejectedValue(new Error('UNIQUE'));
    const result = await service.importDepartments(ORG, [
      { campusId: 'cmp-1', name: 'Operations', code: 'OPS' },
    ]);
    expect(result.failedRows[0]).toMatchObject({ field: 'code', rawValue: 'OPS' });
  });
});

// ============================================================================
// importCourses
// ============================================================================

describe('importCourses', () => {
  it('flags missing deptId / name / code', async () => {
    const result = await service.importCourses(ORG, [
      { name: 'Algorithms', code: 'CS101' },
      { deptId: 'dept-1', code: 'CS101' },
      { deptId: 'dept-1', name: 'Algorithms' },
    ]);
    expect(result.failedRows.map((r) => r.field)).toEqual(['deptId', 'name', 'code']);
    expect(mockRepo.findDepartmentById).not.toHaveBeenCalled();
  });

  it('flags row when department is not found', async () => {
    mockRepo.findDepartmentById.mockResolvedValue(null);
    const result = await service.importCourses(ORG, [
      { deptId: 'missing-dept', name: 'Algorithms', code: 'CS101' },
    ]);
    expect(result.failedRows[0]).toMatchObject({ field: 'deptId', rawValue: 'missing-dept' });
  });

  it('creates course when department exists', async () => {
    mockRepo.findDepartmentById.mockResolvedValue({ id: 'dept-1' });
    mockRepo.createCourse.mockResolvedValue({});
    const result = await service.importCourses(ORG, [
      { deptId: 'dept-1', name: 'Algorithms', code: 'CS101' },
    ]);
    expect(result.successCount).toBe(1);
  });

  it('captures duplicate-course errors at the code field', async () => {
    mockRepo.findDepartmentById.mockResolvedValue({ id: 'dept-1' });
    mockRepo.createCourse.mockRejectedValue(new Error('UNIQUE'));
    const result = await service.importCourses(ORG, [
      { deptId: 'dept-1', name: 'Algorithms', code: 'CS101' },
    ]);
    expect(result.failedRows[0]).toMatchObject({ field: 'code', rawValue: 'CS101' });
  });
});

// ============================================================================
// importSemesters
// ============================================================================

describe('importSemesters', () => {
  it('flags missing name / startDate / endDate', async () => {
    const result = await service.importSemesters(ORG, [
      { startDate: '2026-01-01', endDate: '2026-05-31' },
      { name: 'Spring', endDate: '2026-05-31' },
      { name: 'Spring', startDate: '2026-01-01' },
    ]);
    expect(result.failedRows.map((r) => r.field)).toEqual(['name', 'startDate', 'endDate']);
    expect(mockRepo.createSemester).not.toHaveBeenCalled();
  });

  it('creates semester when all fields are present', async () => {
    mockRepo.createSemester.mockResolvedValue({});
    const result = await service.importSemesters(ORG, [
      { name: 'Spring', startDate: '2026-01-01', endDate: '2026-05-31' },
    ]);
    expect(result.successCount).toBe(1);
    expect(mockRepo.createSemester).toHaveBeenCalledWith(ORG, {
      name: 'Spring',
      startDate: '2026-01-01',
      endDate: '2026-05-31',
    });
  });

  it('captures repository errors at the name field', async () => {
    mockRepo.createSemester.mockRejectedValue(new Error('boom'));
    const result = await service.importSemesters(ORG, [
      { name: 'Spring', startDate: '2026-01-01', endDate: '2026-05-31' },
    ]);
    expect(result.failedRows[0]).toMatchObject({ field: 'name', rawValue: 'Spring' });
  });
});

// ============================================================================
// exportStudents
// ============================================================================

describe('exportStudents', () => {
  it('projects each student to the export row shape', async () => {
    mockRepo.listStudentsByOrg.mockResolvedValue({
      students: [
        {
          studentNumber: 'S1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@x',
          enrolledAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          studentNumber: 'S2',
          firstName: 'Grace',
          lastName: 'Hopper',
          email: null,
          enrolledAt: new Date('2026-01-02T00:00:00Z'),
        },
      ],
      total: 2,
    });

    const rows = await service.exportStudents(ORG);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      studentNumber: 'S1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@x',
      enrolledAt: '2026-01-01T00:00:00.000Z',
    });
    // null email becomes empty string
    expect(rows[1].email).toBe('');
  });
});

// ============================================================================
// exportDepartments
// ============================================================================

describe('exportDepartments', () => {
  it('flattens all departments across every campus in the org', async () => {
    mockRepo.findCampusesByOrg.mockResolvedValue([{ id: 'cmp-1' }, { id: 'cmp-2' }]);
    mockRepo.listDepartmentsByCampus
      .mockResolvedValueOnce([{ id: 'd1', campusId: 'cmp-1', name: 'Ops', code: 'OPS' }])
      .mockResolvedValueOnce([
        { id: 'd2', campusId: 'cmp-2', name: 'Eng', code: 'ENG' },
        { id: 'd3', campusId: 'cmp-2', name: 'Fin', code: 'FIN' },
      ]);

    const rows = await service.exportDepartments(ORG);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.code)).toEqual(['OPS', 'ENG', 'FIN']);
  });

  it('returns empty array when org has no campuses', async () => {
    mockRepo.findCampusesByOrg.mockResolvedValue([]);
    const rows = await service.exportDepartments(ORG);
    expect(rows).toEqual([]);
  });
});

// ============================================================================
// exportCourses
// ============================================================================

describe('exportCourses', () => {
  it('flattens courses across all departments across all campuses', async () => {
    mockRepo.findCampusesByOrg.mockResolvedValue([{ id: 'cmp-1' }]);
    mockRepo.listDepartmentsByCampus.mockResolvedValueOnce([
      { id: 'd1', campusId: 'cmp-1', name: 'Eng', code: 'ENG' },
      { id: 'd2', campusId: 'cmp-1', name: 'Math', code: 'MATH' },
    ]);
    mockRepo.listCoursesByDept
      .mockResolvedValueOnce([{ id: 'c1', deptId: 'd1', name: 'Algo', code: 'CS101', credits: 3 }])
      .mockResolvedValueOnce([{ id: 'c2', deptId: 'd2', name: 'Calc', code: 'MA101', credits: 4 }]);

    const rows = await service.exportCourses(ORG);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.credits)).toEqual([3, 4]);
  });
});

// ============================================================================
// exportSemesters
// ============================================================================

describe('exportSemesters', () => {
  it('serializes Date fields as ISO strings', async () => {
    mockRepo.listSemestersByOrg.mockResolvedValue([
      {
        id: 'sem-1',
        name: 'Spring 2026',
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-05-31T00:00:00Z'),
      },
    ]);

    const rows = await service.exportSemesters(ORG);
    expect(rows[0]).toEqual({
      id: 'sem-1',
      name: 'Spring 2026',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-05-31T00:00:00.000Z',
    });
  });
});

// ============================================================================
// exportClasses
// ============================================================================

describe('exportClasses', () => {
  it('flattens classes across all semesters and includes course name', async () => {
    mockRepo.listSemestersByOrg.mockResolvedValue([{ id: 'sem-1' }, { id: 'sem-2' }]);
    mockRepo.listClassesBySemester
      .mockResolvedValueOnce([
        {
          id: 'cls-1',
          courseId: 'crs-1',
          semesterId: 'sem-1',
          section: 'A',
          capacity: 30,
          course: { name: 'Algorithms' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'cls-2',
          courseId: 'crs-2',
          semesterId: 'sem-2',
          section: 'B',
          capacity: 50,
          course: { name: 'Linear Algebra' },
        },
      ]);

    const rows = await service.exportClasses(ORG);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'cls-1',
      courseName: 'Algorithms',
      section: 'A',
      capacity: 30,
    });
    expect(rows[1].courseName).toBe('Linear Algebra');
  });

  it('returns empty array when org has no semesters', async () => {
    mockRepo.listSemestersByOrg.mockResolvedValue([]);
    expect(await service.exportClasses(ORG)).toEqual([]);
  });
});
