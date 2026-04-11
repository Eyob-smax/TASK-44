// Configuration Domain Types

export interface AppConfig {
  /** Heartbeat freshness threshold in seconds — classroom goes offline after this */
  heartbeatFreshnessSeconds: number;
  /** Whether stored value wallets are enabled org-wide */
  storedValueEnabled: boolean;
  /** Maximum file upload size in bytes */
  maxUploadSizeBytes: number;
  /** Accepted MIME types for image uploads */
  acceptedImageMimeTypes: string[];
  /** Log retention period in days */
  logRetentionDays: number;
  /** Parking exception escalation threshold in minutes */
  parkingEscalationMinutes: number;
  /** Backup retention period in days */
  backupRetentionDays: number;
  /** Object storage mount path */
  storagePath: string;
  /** Backup storage mount path */
  backupPath: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  heartbeatFreshnessSeconds: 120,
  storedValueEnabled: false,
  maxUploadSizeBytes: 10 * 1024 * 1024, // 10 MB
  acceptedImageMimeTypes: ['image/jpeg', 'image/png'],
  logRetentionDays: 30,
  parkingEscalationMinutes: 15,
  backupRetentionDays: 14,
  storagePath: '/data/object-storage',
  backupPath: '/data/backups',
};

// --- Request DTOs ---

export interface UpdateConfigRequest {
  heartbeatFreshnessSeconds?: number;
  storedValueEnabled?: boolean;
  logRetentionDays?: number;
  parkingEscalationMinutes?: number;
}

// --- Response DTOs ---

export interface ConfigResponse {
  config: AppConfig;
  updatedAt: string;
}
