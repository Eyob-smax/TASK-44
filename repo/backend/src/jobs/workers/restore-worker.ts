import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { BaseWorker } from './base-worker.js';
import { db } from '../../app/container.js';
import { config } from '../../app/config.js';
import { logger } from '../../common/logging/logger.js';
import { sanitizeErrorMessage } from '../../common/logging/sanitize-error-message.js';

interface RestorePayload {
  restoreRunId: string;
  backupId: string;
}

function withMysqlPassword(pass: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MYSQL_PWD: pass,
  };
}

function mysqlSslArgs(): string {
  const sslMode = process.env['MYSQL_SSL_MODE'];
  if (!sslMode) return '';
  return sslMode.toUpperCase() === 'DISABLED' ? '--skip-ssl ' : `--ssl-mode=${sslMode} `;
}

function parseDbUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '3306',
    user: parsed.username,
    pass: parsed.password,
    dbname: parsed.pathname.replace(/^\//, ''),
  };
}

export class RestoreWorker extends BaseWorker {
  readonly type = 'restore';

  async handle(payload: object): Promise<void> {
    const { restoreRunId, backupId } = payload as RestorePayload;

    await db.restoreRun.update({
      where: { id: restoreRunId },
      data: { status: 'running' },
    });

    try {
      const backupDir = path.join(config.BACKUP_PATH, backupId);
      const dumpPath = path.join(backupDir, 'dump.sql');
      const metaPath = path.join(backupDir, 'backup-meta.json');

      const manifestPath = path.join(backupDir, 'object-storage-manifest.json');

      const [dumpExists, metaExists, manifestExists] = await Promise.all([
        fs.access(dumpPath).then(() => true).catch(() => false),
        fs.access(metaPath).then(() => true).catch(() => false),
        fs.access(manifestPath).then(() => true).catch(() => false),
      ]);

      const verificationResult: Record<string, unknown> = {
        dumpFilePresent: dumpExists,
        metadataFilePresent: metaExists,
        checkedAt: new Date().toISOString(),
      };

      // Object-storage manifest verification
      if (manifestExists) {
        try {
          const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestRaw) as { generatedAt?: string; files?: unknown[] };
          verificationResult.objectStorageManifestPresent = true;
          verificationResult.objectStorageFileCount = Array.isArray(manifest.files) ? manifest.files.length : 0;
          verificationResult.objectStorageManifestVersion = manifest.generatedAt ?? null;
        } catch {
          verificationResult.objectStorageManifestPresent = true;
          verificationResult.objectStorageManifestParseError = true;
        }
      } else {
        verificationResult.objectStorageManifestPresent = false;
      }

      if (!dumpExists) {
        verificationResult.status = 'dump_missing';
        verificationResult.parseable = false;
        logger.warn({ backupId, restoreRunId }, 'Restore worker: dump.sql not found');

        await db.restoreRun.update({
          where: { id: restoreRunId },
          data: {
            status: 'failed',
            verificationResult: JSON.stringify(verificationResult),
            completedAt: new Date(),
          },
        });
        return;
      }

      // Read metadata
      if (metaExists) {
        const metaRaw = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaRaw) as Record<string, unknown>;
        verificationResult.backupType = meta.type;
        verificationResult.backupStartedAt = meta.startedAt;
      }

      const db_url = process.env['DATABASE_URL'];
      if (!db_url) throw new Error('DATABASE_URL not set');
      const { host, port, user, pass, dbname } = parseDbUrl(db_url);

      // Execute the full database restore from dump.sql
      // This is an admin-triggered operation — the administrator is expected to
      // understand this replaces all current data with the backup snapshot.
      execSync(
        `mysql ${mysqlSslArgs()}-h ${host} -P ${port} -u ${user} ${dbname} < "${dumpPath}"`,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: withMysqlPassword(pass),
        },
      );

      const dumpStat = await fs.stat(dumpPath);
      verificationResult.parseable = true;
      verificationResult.restoredBytes = dumpStat.size;

      // Schema-compatibility check: verify Prisma migrations table is accessible post-restore
      // and count applied migrations to confirm schema integrity.
      try {
        const migrationRows = await db.$queryRaw<Array<{ cnt: bigint }>>`
          SELECT COUNT(*) AS cnt FROM _prisma_migrations WHERE finished_at IS NOT NULL
        `;
        verificationResult.schemaCompatible = true;
        verificationResult.appliedMigrationCount = Number(migrationRows[0]?.cnt ?? 0);
      } catch (schemaErr) {
        verificationResult.schemaCompatible = false;
        verificationResult.schemaCheckError = sanitizeErrorMessage(String(schemaErr));
      }

      // Application-level check: verify at least one core table is queryable post-restore.
      try {
        const userCount = await db.user.count();
        verificationResult.applicationLevelCheck = true;
        verificationResult.userRecordCount = userCount;
      } catch (appErr) {
        verificationResult.applicationLevelCheck = false;
        verificationResult.applicationCheckError = sanitizeErrorMessage(String(appErr));
      }

      // Derive final outcome from verification checks.
      // A restore is only fully verified when schema-compatibility and application-level
      // checks both pass. If either fails, the run is marked failed so operators
      // investigate before treating the restored state as trustworthy.
      const verificationPassed =
        verificationResult.schemaCompatible !== false &&
        verificationResult.applicationLevelCheck !== false;

      verificationResult.status = verificationPassed ? 'restored_verified' : 'restored_verification_failed';

      const finalRunStatus = verificationPassed ? 'completed' : 'failed';

      await db.restoreRun.update({
        where: { id: restoreRunId },
        data: {
          status: finalRunStatus,
          verificationResult: JSON.stringify(verificationResult),
          completedAt: new Date(),
        },
      });

      if (!verificationPassed) {
        logger.warn(
          { restoreRunId, backupId, verificationResult },
          'Restore worker: DB import succeeded but post-restore verification checks failed',
        );
      } else {
        logger.info({ restoreRunId, backupId, restoredBytes: dumpStat.size }, 'Restore worker: completed and verified');
      }
    } catch (err) {
      const sanitized = sanitizeErrorMessage(String(err));
      await db.restoreRun.update({
        where: { id: restoreRunId },
        data: {
          status: 'failed',
          verificationResult: JSON.stringify({ error: sanitized }),
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }
}
