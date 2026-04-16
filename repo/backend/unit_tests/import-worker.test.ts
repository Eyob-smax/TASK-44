import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  importJob: {
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  importRowError: {
    createMany: vi.fn(),
  },
  fileAsset: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
};

const mockImportStudents = vi.fn();
const mockImportClasses = vi.fn();
const mockImportDepartments = vi.fn();
const mockImportCourses = vi.fn();
const mockImportSemesters = vi.fn();

const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn();

// Mock ExcelJS (only needed by the xlsx branch)
const mockReadFile = vi.fn();
const mockEachRow = vi.fn();
vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn(() => ({
      xlsx: { readFile: mockReadFile },
      worksheets: [{ eachRow: mockEachRow }],
    })),
  },
}));

vi.mock('../src/app/container.js', () => ({ db: mockDb }));
vi.mock('../src/app/config.js', () => ({
  config: { STORAGE_PATH: '/tmp/campusops-storage' },
}));
vi.mock('../src/common/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/modules/master-data/service.js', () => ({
  importStudents: mockImportStudents,
  importClasses: mockImportClasses,
  importDepartments: mockImportDepartments,
  importCourses: mockImportCourses,
  importSemesters: mockImportSemesters,
}));
vi.mock('../src/modules/master-data/repository.js', () => ({}));
vi.mock('fs', () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

const { ImportWorker } = await import('../src/jobs/workers/import-worker.js');

const JOB_ID = 'imp-123';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

describe('ImportWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.importJob.update.mockResolvedValue({});
    mockDb.importJob.findUniqueOrThrow.mockResolvedValue({
      id: JOB_ID,
      createdByUserId: USER_ID,
    });
    mockDb.importRowError.createMany.mockResolvedValue({ count: 0 });
    mockDb.fileAsset.create.mockResolvedValue({ id: 'err-asset-1' });
  });

  it('exposes import as its worker type', () => {
    expect(new ImportWorker().type).toBe('import');
  });

  it('imports students from inline payload rows and marks job success when all rows pass', async () => {
    mockImportStudents.mockResolvedValue({ successCount: 2, failedRows: [] });

    const worker = new ImportWorker();
    await worker.handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      rows: [
        { firstName: 'Ada', lastName: 'Lovelace' },
        { firstName: 'Grace', lastName: 'Hopper' },
      ],
    });

    expect(mockImportStudents).toHaveBeenCalledWith(ORG_ID, [
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' },
    ]);
    // First update: processing, second: final
    const firstUpdate = mockDb.importJob.update.mock.calls[0][0];
    expect(firstUpdate.data).toMatchObject({ status: 'processing', totalRows: 2 });
    const finalUpdate = mockDb.importJob.update.mock.calls.at(-1)![0];
    expect(finalUpdate.data).toMatchObject({
      status: 'success',
      successRows: 2,
      failedRows: 0,
    });
    // No errors written
    expect(mockDb.importRowError.createMany).not.toHaveBeenCalled();
    expect(mockDb.fileAsset.create).not.toHaveBeenCalled();
  });

  it('marks the job as partial_success and writes an error-report CSV when some rows fail', async () => {
    mockImportStudents.mockResolvedValue({
      successCount: 1,
      failedRows: [
        { rowNumber: 2, field: 'email', errorMessage: 'Invalid email', rawValue: 'bad-email' },
      ],
    });

    const worker = new ImportWorker();
    await worker.handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      rows: [{ email: 'ok@x' }, { email: 'bad-email' }],
    });

    expect(mockDb.importRowError.createMany).toHaveBeenCalledWith({
      data: [
        {
          importJobId: JOB_ID,
          rowNumber: 2,
          field: 'email',
          errorMessage: 'Invalid email',
          rawValue: 'bad-email',
        },
      ],
    });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(`${JOB_ID}.csv`),
      expect.stringContaining('Row,Field,Error,RawValue'),
      'utf-8',
    );
    expect(mockDb.fileAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mimeType: 'text/csv',
          originalName: `${JOB_ID}-errors.csv`,
        }),
      }),
    );
    const finalUpdate = mockDb.importJob.update.mock.calls.at(-1)![0];
    expect(finalUpdate.data.status).toBe('partial_success');
    expect(finalUpdate.data.successRows).toBe(1);
    expect(finalUpdate.data.failedRows).toBe(1);
  });

  it('marks the job as failed when every row is rejected', async () => {
    mockImportStudents.mockResolvedValue({
      successCount: 0,
      failedRows: [
        { rowNumber: 1, field: 'firstName', errorMessage: 'required', rawValue: null },
        { rowNumber: 2, field: 'email', errorMessage: 'Invalid', rawValue: 'x' },
      ],
    });

    const worker = new ImportWorker();
    await worker.handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      rows: [{}, { email: 'x' }],
    });

    const finalUpdate = mockDb.importJob.update.mock.calls.at(-1)![0];
    expect(finalUpdate.data.status).toBe('failed');
    expect(finalUpdate.data.successRows).toBe(0);
    expect(finalUpdate.data.failedRows).toBe(2);
  });

  it('loads rows from a CSV FileAsset when no inline rows are provided', async () => {
    mockDb.fileAsset.findUnique.mockResolvedValue({
      id: 'asset-csv',
      storagePath: '/tmp/x.csv',
      mimeType: 'text/csv',
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      'firstName,lastName\nAda,Lovelace\nGrace,Hopper\n',
    );
    mockImportStudents.mockResolvedValue({ successCount: 2, failedRows: [] });

    const worker = new ImportWorker();
    await worker.handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      fileAssetId: 'asset-csv',
    });

    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/x.csv', 'utf-8');
    expect(mockImportStudents).toHaveBeenCalledWith(ORG_ID, [
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' },
    ]);
  });

  it('warns and treats rows as empty when the file asset cannot be found on disk', async () => {
    mockDb.fileAsset.findUnique.mockResolvedValue({
      id: 'asset-missing',
      storagePath: '/tmp/missing.csv',
      mimeType: 'text/csv',
    });
    mockExistsSync.mockReturnValue(false);
    mockImportStudents.mockResolvedValue({ successCount: 0, failedRows: [] });

    const worker = new ImportWorker();
    await worker.handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      fileAssetId: 'asset-missing',
    });

    expect(mockReadFileSync).not.toHaveBeenCalled();
    // With zero rows and zero failures, result is success (empty import)
    const finalUpdate = mockDb.importJob.update.mock.calls.at(-1)![0];
    expect(finalUpdate.data.status).toBe('success');
  });

  it('marks the job failed for unsupported entity types', async () => {
    const worker = new ImportWorker();
    await worker.handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'unknown_entity',
      rows: [{ whatever: 1 }],
    });

    const finalUpdate = mockDb.importJob.update.mock.calls.at(-1)![0];
    expect(finalUpdate.data.status).toBe('failed');
    expect(mockImportStudents).not.toHaveBeenCalled();
    expect(mockImportClasses).not.toHaveBeenCalled();
  });

  it('delegates to each entity-type importer: classes', async () => {
    mockImportClasses.mockResolvedValue({ successCount: 1, failedRows: [] });

    const worker = new ImportWorker();
    await worker.handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'classes',
      rows: [{ code: 'CS101' }],
    });

    expect(mockImportClasses).toHaveBeenCalled();
    expect(mockImportStudents).not.toHaveBeenCalled();
  });

  it('delegates to importDepartments', async () => {
    mockImportDepartments.mockResolvedValue({ successCount: 1, failedRows: [] });

    await new ImportWorker().handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'departments',
      rows: [{ name: 'Ops' }],
    });

    expect(mockImportDepartments).toHaveBeenCalled();
  });

  it('delegates to importCourses', async () => {
    mockImportCourses.mockResolvedValue({ successCount: 1, failedRows: [] });

    await new ImportWorker().handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'courses',
      rows: [{ code: 'CS101' }],
    });

    expect(mockImportCourses).toHaveBeenCalled();
  });

  it('delegates to importSemesters', async () => {
    mockImportSemesters.mockResolvedValue({ successCount: 1, failedRows: [] });

    await new ImportWorker().handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'semesters',
      rows: [{ label: 'Spring 2026' }],
    });

    expect(mockImportSemesters).toHaveBeenCalled();
  });

  it('CSV error report escapes embedded quotes in field values', async () => {
    mockImportStudents.mockResolvedValue({
      successCount: 0,
      failedRows: [
        { rowNumber: 3, field: 'note', errorMessage: 'Bad "quote" found', rawValue: 'he said "hi"' },
      ],
    });

    await new ImportWorker().handle({
      importJobId: JOB_ID,
      orgId: ORG_ID,
      entityType: 'students',
      rows: [{}, {}, { note: 'he said "hi"' }],
    });

    const csv = mockWriteFileSync.mock.calls[0][1] as string;
    // Embedded quotes are doubled
    expect(csv).toContain('""quote""');
    expect(csv).toContain('""hi""');
  });
});
