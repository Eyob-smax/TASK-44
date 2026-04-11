import { createApp } from './app/server.js';
import { config } from './app/config.js';
import { logger } from './common/logging/logger.js';
import { readFileSync } from 'fs';
import https from 'https';
import { ImportWorker } from './jobs/workers/import-worker.js';
import { ExportWorker } from './jobs/workers/export-worker.js';
import { BackupWorker } from './jobs/workers/backup-worker.js';
import { RestoreWorker } from './jobs/workers/restore-worker.js';
import { EscalationCheckWorker } from './jobs/workers/escalation-check-worker.js';
import { CarrierSyncWorker } from './jobs/workers/carrier-sync-worker.js';
import { LogRetentionWorker } from './jobs/workers/log-retention-worker.js';
import { enqueueDailyFullBackupIfMissing } from './jobs/daily-backup-scheduler.js';
import { enqueueJob } from './jobs/job-monitor.js';
import { db } from './app/container.js';

const app = createApp();

function startServer(): void {
  if (config.NODE_ENV === 'production') {
    if (!config.TLS_CERT_PATH || !config.TLS_KEY_PATH) {
      throw new Error(
        'TLS_CERT_PATH and TLS_KEY_PATH are required in production to enforce TLS transport on LAN.',
      );
    }

    const cert = readFileSync(config.TLS_CERT_PATH);
    const key = readFileSync(config.TLS_KEY_PATH);
    https.createServer({ cert, key }, app).listen(config.PORT, () => {
      logger.info(`CampusOps backend listening with HTTPS on port ${config.PORT}`);
    });
    return;
  }

  app.listen(config.PORT, () => {
    logger.info(`CampusOps backend listening on HTTP port ${config.PORT}`);
  });
}

startServer();

// Worker polling — each worker claims and processes one job per tick.
// Errors inside run() are caught by BaseWorker and marked as failed.
const workers = [
  { worker: new ImportWorker(),           intervalMs: 5_000 },
  { worker: new ExportWorker(),           intervalMs: 5_000 },
  { worker: new BackupWorker(),           intervalMs: 5_000 },
  { worker: new RestoreWorker(),          intervalMs: 5_000 },
  { worker: new EscalationCheckWorker(),  intervalMs: 30_000 },
  { worker: new CarrierSyncWorker(),      intervalMs: 60_000 },
  { worker: new LogRetentionWorker(),     intervalMs: 3_600_000 },
];

for (const { worker, intervalMs } of workers) {
  setInterval(() => { worker.run().catch(() => {}); }, intervalMs);
}

async function enqueueEscalationChecks(): Promise<void> {
  const facilities = await db.parkingFacility.findMany({ select: { id: true } });
  await Promise.all(
    facilities.map((facility) => enqueueJob('escalation_check', { facilityId: facility.id })),
  );
  logger.info({ count: facilities.length }, 'Enqueued recurring escalation_check jobs');
}

async function enqueueCarrierSyncJobs(): Promise<void> {
  const carriers = await db.carrier.findMany({ where: { isActive: true }, select: { id: true } });
  await Promise.all(
    carriers.map((carrier) => enqueueJob('carrier_sync', { carrierId: carrier.id })),
  );
  logger.info({ count: carriers.length }, 'Enqueued recurring carrier_sync jobs');
}

async function enqueueLogRetentionJob(): Promise<void> {
  await enqueueJob('log_retention', {});
  logger.info('Enqueued recurring log_retention job');
}

function startRecurringSchedulers(): void {
  const runSafely = (taskName: string, task: () => Promise<void>) => {
    task().catch((err) => logger.error({ err }, `Failed recurring scheduler task: ${taskName}`));
  };

  // Initial enqueue at startup.
  runSafely('escalation_check', enqueueEscalationChecks);
  runSafely('carrier_sync', enqueueCarrierSyncJobs);
  runSafely('log_retention', enqueueLogRetentionJob);
  runSafely('daily_backup', enqueueDailyFullBackupIfMissing);

  // Recurring cadence.
  setInterval(() => runSafely('escalation_check', enqueueEscalationChecks), 15 * 60 * 1000);
  setInterval(() => runSafely('carrier_sync', enqueueCarrierSyncJobs), 60 * 60 * 1000);
  setInterval(() => runSafely('log_retention', enqueueLogRetentionJob), 24 * 60 * 60 * 1000);
  setInterval(() => runSafely('daily_backup', enqueueDailyFullBackupIfMissing), 24 * 60 * 60 * 1000);
}

startRecurringSchedulers();
