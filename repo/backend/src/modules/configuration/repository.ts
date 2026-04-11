import { config as envConfig } from '../../app/config.js';
import { DEFAULT_CONFIG, type AppConfig, type UpdateConfigRequest } from './types.js';

/**
 * Runtime configuration overlay.
 *
 * Policy fields (heartbeat threshold, stored-value flag, etc.) are adjustable at
 * runtime through the admin API. Changes persist in memory until the process
 * restarts. For permanent overrides, set the corresponding environment variable
 * or update the Docker Compose env file.
 */
const runtimeOverrides: Partial<AppConfig> = {};

let lastUpdatedAt: Date = new Date();

function buildEffective(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    storagePath: envConfig.STORAGE_PATH,
    backupPath: envConfig.BACKUP_PATH,
    ...runtimeOverrides,
  };
}

export function getConfig(): { config: AppConfig; updatedAt: string } {
  return { config: buildEffective(), updatedAt: lastUpdatedAt.toISOString() };
}

export function applyConfigUpdate(updates: UpdateConfigRequest): { config: AppConfig; updatedAt: string } {
  if (updates.heartbeatFreshnessSeconds !== undefined) {
    runtimeOverrides.heartbeatFreshnessSeconds = updates.heartbeatFreshnessSeconds;
  }
  if (updates.storedValueEnabled !== undefined) {
    runtimeOverrides.storedValueEnabled = updates.storedValueEnabled;
  }
  if (updates.logRetentionDays !== undefined) {
    runtimeOverrides.logRetentionDays = updates.logRetentionDays;
  }
  if (updates.parkingEscalationMinutes !== undefined) {
    runtimeOverrides.parkingEscalationMinutes = updates.parkingEscalationMinutes;
  }

  lastUpdatedAt = new Date();
  return getConfig();
}

/** Reset all runtime overrides — exposed for testing only. */
export function _resetOverrides(): void {
  Object.keys(runtimeOverrides).forEach((k) => {
    delete (runtimeOverrides as Record<string, unknown>)[k];
  });
  lastUpdatedAt = new Date();
}
