import { BaseWorker } from './base-worker.js';
import { db } from '../../app/container.js';
import { logger } from '../../common/logging/logger.js';
import { getConfig } from '../../modules/configuration/service.js';

export class LogRetentionWorker extends BaseWorker {
  readonly type = 'log_retention';

  async handle(_payload: object): Promise<void> {
    const retentionDays = getConfig().config.logRetentionDays;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await db.applicationLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    logger.info(
      { deletedCount: result.count, cutoff: cutoff.toISOString(), retentionDays },
      'Log retention: deleted old application logs',
    );
  }
}
