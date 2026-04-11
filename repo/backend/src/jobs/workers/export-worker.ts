import * as fs from 'fs';
import * as path from 'path';
import { BaseWorker } from './base-worker.js';
import { config } from '../../app/config.js';
import { db } from '../../app/container.js';
import { logger } from '../../common/logging/logger.js';
import { exportStudents, exportClasses, exportDepartments, exportCourses, exportSemesters } from '../../modules/master-data/service.js';

function objectsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const safe = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => safe(row[h])).join(','));
  }
  return lines.join('\n');
}

export class ExportWorker extends BaseWorker {
  readonly type = 'export';

  async handle(payload: object): Promise<void> {
    const { exportJobId, orgId, entityType } = payload as {
      exportJobId: string;
      orgId: string;
      entityType: string;
      format: string;
    };

    await db.exportJob.update({
      where: { id: exportJobId },
      data: { status: 'processing', startedAt: new Date() },
    });

    let rows: Record<string, unknown>[];

    if (entityType === 'students') {
      rows = await exportStudents(orgId);
    } else if (entityType === 'classes') {
      rows = await exportClasses(orgId);
    } else if (entityType === 'departments') {
      rows = await exportDepartments(orgId);
    } else if (entityType === 'courses') {
      rows = await exportCourses(orgId);
    } else if (entityType === 'semesters') {
      rows = await exportSemesters(orgId);
    } else {
      logger.warn({ exportJobId, entityType }, 'Unsupported export entity type');
      await db.exportJob.update({
        where: { id: exportJobId },
        data: { status: 'failed', completedAt: new Date() },
      });
      return;
    }

    const csvContent = objectsToCsv(rows);
    const exportDir = path.join(config.STORAGE_PATH, 'exports');
    const exportPath = path.join(exportDir, `${exportJobId}.csv`);

    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(exportPath, csvContent, 'utf-8');

    const job = await db.exportJob.findUniqueOrThrow({ where: { id: exportJobId } });
    const fileAsset = await db.fileAsset.create({
      data: {
        originalName: `${entityType}-export-${exportJobId}.csv`,
        storagePath: exportPath,
        mimeType: 'text/csv',
        sizeBytes: Buffer.byteLength(csvContent, 'utf-8'),
        uploadedByUserId: job.createdByUserId,
      },
    });

    await db.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'completed',
        fileAssetId: fileAsset.id,
        completedAt: new Date(),
      },
    });

    logger.info({ exportJobId, entityType, rowCount: rows.length }, 'Export job completed');
  }
}
