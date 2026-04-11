import * as fs from 'fs';
import * as path from 'path';
import { BaseWorker } from './base-worker.js';
import ExcelJS from 'exceljs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function parseCsvRows(content: string): Record<string, unknown>[] {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

async function parseXlsxRows(storagePath: string): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(storagePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: Record<string, unknown>[] = [];
  const headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => headers.push(String(cell.value ?? '').trim()));
    } else {
      const obj: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        obj[headers[colNumber - 1] ?? `col${colNumber}`] =
          cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
      });
      rows.push(obj);
    }
  });
  return rows;
}
import { config } from '../../app/config.js';
import { db } from '../../app/container.js';
import { logger } from '../../common/logging/logger.js';
import { importStudents, importClasses, importDepartments, importCourses, importSemesters } from '../../modules/master-data/service.js';
import * as masterDataRepo from '../../modules/master-data/repository.js';
import type { ImportRowValidationError } from '../../modules/master-data/types.js';

export class ImportWorker extends BaseWorker {
  readonly type = 'import';

  async handle(payload: object): Promise<void> {
    const { importJobId, orgId, entityType, rows: payloadRows = [], fileAssetId } = payload as {
      importJobId: string;
      orgId: string;
      entityType: string;
      rows?: Record<string, unknown>[];
      fileAssetId?: string;
    };

    let rows = payloadRows;

    if (fileAssetId && rows.length === 0) {
      const asset = await db.fileAsset.findUnique({ where: { id: fileAssetId } });
      if (asset && fs.existsSync(asset.storagePath)) {
        if (asset.mimeType === XLSX_MIME) {
          rows = await parseXlsxRows(asset.storagePath);
        } else {
          const content = fs.readFileSync(asset.storagePath, 'utf-8');
          rows = parseCsvRows(content);
        }
      } else {
        logger.warn({ importJobId, fileAssetId }, 'Import file asset not found or missing on disk');
      }
    }

    await db.importJob.update({
      where: { id: importJobId },
      data: { status: 'processing', startedAt: new Date(), totalRows: rows.length },
    });

    let result: { successCount: number; failedRows: ImportRowValidationError[] };

    if (entityType === 'students') {
      result = await importStudents(orgId, rows);
    } else if (entityType === 'classes') {
      result = await importClasses(orgId, rows);
    } else if (entityType === 'departments') {
      result = await importDepartments(orgId, rows);
    } else if (entityType === 'courses') {
      result = await importCourses(orgId, rows);
    } else if (entityType === 'semesters') {
      result = await importSemesters(orgId, rows);
    } else {
      logger.warn({ importJobId, entityType }, 'Unsupported import entity type');
      await db.importJob.update({
        where: { id: importJobId },
        data: { status: 'failed', failedRows: rows.length, completedAt: new Date() },
      });
      return;
    }

    // Persist row errors
    if (result.failedRows.length > 0) {
      await db.importRowError.createMany({
        data: result.failedRows.map((e) => ({
          importJobId,
          rowNumber: e.rowNumber,
          field: e.field,
          errorMessage: e.errorMessage,
          rawValue: e.rawValue ?? null,
        })),
      });

      // Generate correction report CSV
      const csvLines = ['Row,Field,Error,RawValue'];
      for (const e of result.failedRows) {
        const safe = (v: string) => `"${v.replace(/"/g, '""')}"`;
        csvLines.push(
          `${e.rowNumber},${safe(e.field)},${safe(e.errorMessage)},${safe(e.rawValue ?? '')}`,
        );
      }
      const csvContent = csvLines.join('\n');
      const reportDir = path.join(config.STORAGE_PATH, 'import-reports');
      const reportPath = path.join(reportDir, `${importJobId}.csv`);

      fs.mkdirSync(reportDir, { recursive: true });
      fs.writeFileSync(reportPath, csvContent, 'utf-8');

      const fileAsset = await db.fileAsset.create({
        data: {
          originalName: `${importJobId}-errors.csv`,
          storagePath: reportPath,
          mimeType: 'text/csv',
          sizeBytes: Buffer.byteLength(csvContent, 'utf-8'),
          uploadedByUserId: (await db.importJob.findUniqueOrThrow({ where: { id: importJobId } })).createdByUserId,
        },
      });

      await db.importJob.update({
        where: { id: importJobId },
        data: {
          errorReportAssetId: fileAsset.id,
        },
      });
    }

    const status =
      result.failedRows.length === 0
        ? 'success'
        : result.successCount === 0
        ? 'failed'
        : 'partial_success';

    await db.importJob.update({
      where: { id: importJobId },
      data: {
        status,
        successRows: result.successCount,
        failedRows: result.failedRows.length,
        completedAt: new Date(),
      },
    });

    logger.info({ importJobId, entityType, status, successRows: result.successCount, failedRows: result.failedRows.length }, 'Import job completed');
  }
}
