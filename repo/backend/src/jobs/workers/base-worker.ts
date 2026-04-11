import { claimNextJob, markJobCompleted, markJobFailed } from '../job-monitor.js';
import { logger } from '../../common/logging/logger.js';
import { sanitizeErrorMessage } from '../../common/logging/sanitize-error-message.js';

export abstract class BaseWorker {
  abstract readonly type: string;

  abstract handle(payload: object): Promise<void>;

  async run(): Promise<void> {
    const job = await claimNextJob(this.type);
    if (!job) return;

    logger.info(`Job started`, { jobId: job.id, type: this.type });

    try {
      await this.handle(job.payload);
      await markJobCompleted(job.id);
      logger.info(`Job completed`, { jobId: job.id, type: this.type });
    } catch (err) {
      const rawErrorMessage = err instanceof Error ? err.message : String(err);
      const errorMessage = sanitizeErrorMessage(rawErrorMessage);
      await markJobFailed(job.id, errorMessage);
      logger.error(`Job failed`, { jobId: job.id, type: this.type, error: errorMessage });
    }
  }
}
