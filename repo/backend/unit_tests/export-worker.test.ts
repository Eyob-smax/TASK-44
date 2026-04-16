import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  exportJob: {
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  fileAsset: {
    create: vi.fn(),
  },
};

const mockExportStudents = vi.fn();
const mockExportClasses = vi.fn();
const mockExportDepartments = vi.fn();
const mockExportCourses = vi.fn();
const mockExportSemesters = vi.fn();

const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('../src/app/container.js', () => ({ db: mockDb }));
vi.mock('../src/app/config.js', () => ({
  config: { STORAGE_PATH: '/tmp/campusops-storage' },
}));
vi.mock('../src/common/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/modules/master-data/service.js', () => ({
  exportStudents: mockExportStudents,
  exportClasses: mockExportClasses,
  exportDepartments: mockExportDepartments,
  exportCourses: mockExportCourses,
  exportSemesters: mockExportSemesters,
}));
vi.mock('fs', () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
}));

const { ExportWorker } = await import('../src/jobs/workers/export-worker.js');

const JOB_ID = 'exp-123';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

describe('ExportWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.exportJob.update.mockResolvedValue({});
    mockDb.exportJob.findUniqueOrThrow.mockResolvedValue({
      id: JOB_ID,
      createdByUserId: USER_ID,
    });
    mockDb.fileAsset.create.mockResolvedValue({ id: 'asset-1' });
  });

  it('exposes export as its worker type', () => {
    expect(new ExportWorker().type).toBe('export');
  });

  it('writes a CSV file for students and marks the job completed', async () => {
    mockExportStudents.mockResolvedValue([
      { id: 's1', firstName: 'Ada', lastName: 'Lovelace' },
      { id: 's2', firstName: 'Grace', lastName: 'Hopper' },
    ]);

    const worker = new ExportWorker();
    await worker.handle({
      exportJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      format: 'csv',
    });

    expect(mockExportStudents).toHaveBeenCalledWith(ORG_ID);
    // First update: processing, second: completed
    expect(mockDb.exportJob.update).toHaveBeenCalledTimes(2);
    expect(mockDb.exportJob.update.mock.calls[0][0]).toMatchObject({
      where: { id: JOB_ID },
      data: expect.objectContaining({ status: 'processing' }),
    });
    const finalUpdate = mockDb.exportJob.update.mock.calls[1][0];
    expect(finalUpdate).toMatchObject({
      where: { id: JOB_ID },
      data: expect.objectContaining({ status: 'completed', fileAssetId: 'asset-1' }),
    });

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('exports'), {
      recursive: true,
    });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(`${JOB_ID}.csv`),
      expect.stringContaining('firstName,lastName'),
      'utf-8',
    );
    const csv = mockWriteFileSync.mock.calls[0][1] as string;
    expect(csv).toContain('Ada');
    expect(csv).toContain('Grace');
  });

  it('escapes quotes, commas, and newlines in CSV output', async () => {
    mockExportStudents.mockResolvedValue([
      { id: 's1', firstName: 'Jo, Jr.', lastName: 'O"Brien\nNewline' },
    ]);

    const worker = new ExportWorker();
    await worker.handle({
      exportJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      format: 'csv',
    });

    const csv = mockWriteFileSync.mock.calls[0][1] as string;
    // Value with comma gets wrapped in quotes
    expect(csv).toContain('"Jo, Jr."');
    // Embedded quote is doubled
    expect(csv).toContain('O""Brien');
  });

  it('writes empty CSV when the export produces no rows', async () => {
    mockExportClasses.mockResolvedValue([]);

    const worker = new ExportWorker();
    await worker.handle({
      exportJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'classes',
      format: 'csv',
    });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(`${JOB_ID}.csv`),
      '',
      'utf-8',
    );
  });

  it('delegates to exportDepartments for departments entity type', async () => {
    mockExportDepartments.mockResolvedValue([{ id: 'd1', name: 'Ops' }]);

    const worker = new ExportWorker();
    await worker.handle({
      exportJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'departments',
      format: 'csv',
    });

    expect(mockExportDepartments).toHaveBeenCalledWith(ORG_ID);
    expect(mockExportStudents).not.toHaveBeenCalled();
  });

  it('delegates to exportCourses for courses entity type', async () => {
    mockExportCourses.mockResolvedValue([{ id: 'c1', code: 'CS101' }]);

    const worker = new ExportWorker();
    await worker.handle({
      exportJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'courses',
      format: 'csv',
    });

    expect(mockExportCourses).toHaveBeenCalledWith(ORG_ID);
  });

  it('delegates to exportSemesters for semesters entity type', async () => {
    mockExportSemesters.mockResolvedValue([{ id: 'sem-1', label: 'Spring 2026' }]);

    const worker = new ExportWorker();
    await worker.handle({
      exportJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'semesters',
      format: 'csv',
    });

    expect(mockExportSemesters).toHaveBeenCalledWith(ORG_ID);
  });

  it('marks the job failed and returns early for unsupported entity types', async () => {
    const worker = new ExportWorker();
    await worker.handle({
      exportJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'unknown_entity',
      format: 'csv',
    });

    // Update calls: 1 = processing, 2 = failed
    expect(mockDb.exportJob.update).toHaveBeenCalledTimes(2);
    const failedCall = mockDb.exportJob.update.mock.calls[1][0];
    expect(failedCall.data).toMatchObject({ status: 'failed' });
    // Nothing written, no file asset created
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockDb.fileAsset.create).not.toHaveBeenCalled();
  });

  it('creates a FileAsset linked to the job creator', async () => {
    mockExportStudents.mockResolvedValue([{ id: 's1', firstName: 'A' }]);
    mockDb.exportJob.findUniqueOrThrow.mockResolvedValue({
      id: JOB_ID,
      createdByUserId: 'creator-42',
    });

    const worker = new ExportWorker();
    await worker.handle({
      exportJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      format: 'csv',
    });

    expect(mockDb.fileAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mimeType: 'text/csv',
          uploadedByUserId: 'creator-42',
          storagePath: expect.stringContaining(`${JOB_ID}.csv`),
        }),
      }),
    );
  });
});
