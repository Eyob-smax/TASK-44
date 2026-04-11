import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { BaseWorker } from './base-worker.js';
import { db } from '../../app/container.js';
import { config } from '../../app/config.js';
import { logger } from '../../common/logging/logger.js';
import { deleteExpiredBackups } from '../../modules/backups/repository.js';

interface BackupPayload {
  backupId: string;
  type: string;
  storagePath: string;
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

export class BackupWorker extends BaseWorker {
  readonly type = 'backup';

  async handle(payload: object): Promise<void> {
    const { backupId, type, storagePath } = payload as BackupPayload;

    // Mark running
    await db.backupRecord.update({
      where: { id: backupId },
      data: { status: 'running' },
    });

    try {
      const backupDir = path.join(config.BACKUP_PATH, backupId);
      await fs.mkdir(backupDir, { recursive: true });

      const dumpPath = path.join(backupDir, 'dump.sql');
      const metaPath = path.join(backupDir, 'backup-meta.json');

      // Parse DATABASE_URL and run mysqldump
      const db_url = process.env['DATABASE_URL'];
      if (!db_url) throw new Error('DATABASE_URL not set');
      const { host, port, user, pass, dbname } = parseDbUrl(db_url);

      execSync(
        `mysqldump ${mysqlSslArgs()}-h ${host} -P ${port} -u ${user} ${dbname} > "${dumpPath}"`,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: withMysqlPassword(pass),
        },
      );

      // Enumerate object-storage files and write manifest
      const manifestPath = path.join(backupDir, 'object-storage-manifest.json');
      let objectStorageFiles: { name: string; sizeBytes: number }[] = [];
      try {
        const entries = await fs.readdir(config.STORAGE_PATH);
        objectStorageFiles = await Promise.all(
          entries.map(async (name) => {
            const stat = await fs.stat(path.join(config.STORAGE_PATH, name));
            return { name, sizeBytes: stat.size };
          }),
        );
      } catch {
        // STORAGE_PATH may not exist or be empty in dev/test — proceed with empty manifest
      }
      const manifest = {
        generatedAt: new Date().toISOString(),
        storageBasePath: config.STORAGE_PATH,
        files: objectStorageFiles,
      };
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      // Write metadata
      const meta = {
        backupId,
        type,
        storagePath,
        startedAt: new Date().toISOString(),
        dumpFile: 'dump.sql',
        objectStorageManifestFile: 'object-storage-manifest.json',
        objectStorageFileCount: objectStorageFiles.length,
      };
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

      const dumpStat = await fs.stat(dumpPath);

      // Delete expired backups
      const deleted = await deleteExpiredBackups();
      logger.info({ deletedCount: (deleted as any).count ?? 0 }, 'Backup worker: expired records purged');

      await db.backupRecord.update({
        where: { id: backupId },
        data: {
          status: 'completed',
          sizeBytes: BigInt(dumpStat.size),
          completedAt: new Date(),
        },
      });

      logger.info({ backupId, type, sizeBytes: dumpStat.size }, 'Backup worker: completed');
    } catch (err) {
      await db.backupRecord.update({
        where: { id: backupId },
        data: { status: 'failed', completedAt: new Date() },
      });
      throw err;
    }
  }
}
