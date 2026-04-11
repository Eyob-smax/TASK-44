import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { BaseWorker } from './base-worker.js';
import { db } from '../../app/container.js';
import { decrypt } from '../../common/encryption/aes256.js';
import { logger } from '../../common/logging/logger.js';
import { getOrCreateBreaker } from '../../common/circuit-breaker/circuit-breaker.js';
import { addTrackingUpdate, upsertSyncCursor } from '../../modules/logistics/repository.js';

/**
 * Enforces the disconnected-LAN constraint: carrier REST connector URLs must resolve
 * to a private/local network host. Rejects any URL whose hostname is a public domain.
 */
function assertLanUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Carrier REST connector URL is not a valid URL: ${url}`);
  }
  const h = parsed.hostname;
  // Accept localhost
  if (h === 'localhost') return;
  // Accept LAN TLD suffixes
  if (/\.(lan|local|internal|intranet)$/i.test(h)) return;
  // Accept private IPv4 ranges: 10.x, 172.16-31.x, 192.168.x, 127.x
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return;
  if (/^127\.\d+\.\d+\.\d+$/.test(h)) return;
  throw new Error(
    `Carrier REST connector URL must be a LAN-local endpoint; rejected: ${url}`,
  );
}

const carrierApiBreaker = getOrCreateBreaker('carrier-sync-rest-api', {
  failureThreshold: 5,
  successThreshold: 2,
  openTimeoutMs: 5 * 60 * 1000,
});

export class CarrierSyncWorker extends BaseWorker {
  readonly type = 'carrier_sync';

  async handle(payload: object): Promise<void> {
    const { carrierId } = payload as { carrierId: string };

    const carrier = await db.carrier.findUnique({ where: { id: carrierId } });
    if (!carrier) {
      logger.warn({ carrierId }, 'Carrier not found for sync');
      return;
    }

    const connectorConfig = carrier.connectorConfig ? decrypt(carrier.connectorConfig) : null;
    const cursor = await db.carrierSyncCursor.findUnique({ where: { carrierId } });

    try {
      if (carrier.connectorType === 'manual') {
        // No-op for manual carriers — just update cursor timestamp
        logger.info({ carrierId, connectorType: 'manual' }, 'Manual carrier sync: no-op');

      } else if (carrier.connectorType === 'rest_api') {
        const cfg = JSON.parse(connectorConfig ?? '{}') as {
          apiUrl: string;
          apiKey?: string;
          timeoutMs?: number;
        };

        assertLanUrl(cfg.apiUrl);

        const since = cursor?.lastSyncAt?.toISOString() ?? '';
        const response = await carrierApiBreaker.execute(() =>
          axios.get<unknown[]>(cfg.apiUrl, {
            params: { since },
            headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
            timeout: cfg.timeoutMs ?? 10000,
          }),
        );

        const updates = Array.isArray(response.data) ? response.data : [];
        for (const update of updates) {
          const u = update as { shipmentId?: string; status?: string; location?: string };
          if (u.shipmentId && u.status) {
            const shipment = await db.shipment.findUnique({
              where: { id: u.shipmentId },
              select: { carrierId: true },
            });
            if (!shipment || shipment.carrierId !== carrierId) {
              logger.warn(
                { carrierId, shipmentId: u.shipmentId },
                'Carrier sync: shipment ownership mismatch — skipping update',
              );
              continue;
            }
            await addTrackingUpdate(u.shipmentId, u.status, u.location ?? null, 'carrier_sync');
          }
        }

        await upsertSyncCursor(carrierId, {
          lastSyncAt: new Date(),
          lastSuccessCursor: new Date().toISOString(),
          errorState: null,
        });

        logger.info({ carrierId, updatesProcessed: updates.length }, 'Carrier sync: rest_api completed');

      } else if (carrier.connectorType === 'file_drop') {
        const cfg = JSON.parse(connectorConfig ?? '{}') as {
          watchDirectory: string;
          processedDirectory?: string;
        };

        const watchDir = cfg.watchDirectory;
        const processedDir = cfg.processedDirectory ?? path.join(watchDir, 'processed');

        if (!fs.existsSync(watchDir)) {
          logger.warn({ carrierId, watchDir }, 'Carrier sync: watch directory not found');
          await upsertSyncCursor(carrierId, { lastSyncAt: new Date(), errorState: null });
          return;
        }

        fs.mkdirSync(processedDir, { recursive: true });

        const files = fs.readdirSync(watchDir).filter((f) => f.endsWith('.json'));
        let updatesProcessed = 0;

        for (const file of files) {
          const filePath = path.join(watchDir, file);
          const stat = fs.statSync(filePath);

          // Skip files not modified after last sync
          if (cursor?.lastSyncAt && stat.mtime <= cursor.lastSyncAt) continue;

          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const updates = JSON.parse(content) as unknown[];
            const updateList = Array.isArray(updates) ? updates : [updates];

            for (const update of updateList) {
              const u = update as { shipmentId?: string; status?: string; location?: string };
              if (u.shipmentId && u.status) {
                const shipment = await db.shipment.findUnique({
                  where: { id: u.shipmentId },
                  select: { carrierId: true },
                });
                if (!shipment || shipment.carrierId !== carrierId) {
                  logger.warn(
                    { carrierId, shipmentId: u.shipmentId },
                    'Carrier sync: shipment ownership mismatch — skipping update',
                  );
                  continue;
                }
                await addTrackingUpdate(u.shipmentId, u.status, u.location ?? null, 'carrier_sync');
                updatesProcessed++;
              }
            }

            // Move processed file
            fs.renameSync(filePath, path.join(processedDir, file));
          } catch (fileErr) {
            logger.warn({ carrierId, file, err: String(fileErr) }, 'Carrier sync: failed to process file');
          }
        }

        await upsertSyncCursor(carrierId, {
          lastSyncAt: new Date(),
          lastSuccessCursor: new Date().toISOString(),
          errorState: null,
        });

        logger.info({ carrierId, updatesProcessed }, 'Carrier sync: file_drop completed');
      }

      // Upsert sync cursor with updated timestamp for all types
      await db.carrierSyncCursor.upsert({
        where: { carrierId },
        update: { lastSyncAt: new Date(), errorState: null },
        create: {
          carrierId,
          lastSyncAt: new Date(),
          lastSuccessCursor: cursor?.lastSuccessCursor ?? null,
          errorState: null,
        },
      });

      logger.info({ carrierId }, 'Carrier sync cursor updated');
    } catch (err) {
      const errorState = String(err);
      await db.carrierSyncCursor.upsert({
        where: { carrierId },
        update: { lastSyncAt: new Date(), errorState },
        create: {
          carrierId,
          lastSyncAt: new Date(),
          lastSuccessCursor: cursor?.lastSuccessCursor ?? null,
          errorState,
        },
      });
      logger.error({ carrierId, err: errorState }, 'Carrier sync failed');
      throw err;
    }
  }
}
