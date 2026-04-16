import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/container.js', () => ({
  db: {
    student: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    classEnrollment: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    importJob: {
      create: vi.fn(),
    },
  },
}));

const { db } = await import('../src/app/container.js');
const repo = await import('../src/modules/master-data/repository.js');

describe('master-data repository unit coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listStudentsByOrg applies pagination and returns students+total', async () => {
    vi.mocked(db.student.findMany).mockResolvedValue([{ id: 'stu-1' }, { id: 'stu-2' }] as any);
    vi.mocked(db.student.count).mockResolvedValue(7 as any);

    const result = await repo.listStudentsByOrg('org-1', { page: 2, limit: 2 });

    expect(db.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'org-1' },
        skip: 2,
        take: 2,
        orderBy: { lastName: 'asc' },
      }),
    );
    expect(db.student.count).toHaveBeenCalledWith({ where: { orgId: 'org-1' } });
    expect(result).toEqual({ students: [{ id: 'stu-1' }, { id: 'stu-2' }], total: 7 });
  });

  it('enrollStudent throws conflict when enrollment already exists', async () => {
    vi.mocked(db.classEnrollment.findUnique).mockResolvedValue({ id: 'existing' } as any);

    await expect(repo.enrollStudent('class-1', 'student-1')).rejects.toThrow(/already enrolled/i);
    expect(db.classEnrollment.create).not.toHaveBeenCalled();
  });

  it('createImportJob persists pending status and actor id', async () => {
    vi.mocked(db.importJob.create).mockResolvedValue({ id: 'imp-1' } as any);

    await repo.createImportJob({
      entityType: 'students',
      fileName: 'students.csv',
      createdByUserId: 'user-1',
    });

    expect(db.importJob.create).toHaveBeenCalledWith({
      data: {
        entityType: 'students',
        fileName: 'students.csv',
        createdByUserId: 'user-1',
        status: 'pending',
      },
    });
  });
});
