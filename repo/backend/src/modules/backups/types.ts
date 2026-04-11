// Backup & Restore Domain Types

export enum BackupType {
  FULL = 'full',
}

export enum BackupStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum RestoreStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** Backup retention: 14 days */
export const BACKUP_RETENTION_DAYS = 14;

export interface BackupRecord {
  id: string;
  type: BackupType;
  storagePath: string;
  sizeBytes: bigint | null;
  status: BackupStatus;
  startedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export interface RestoreRun {
  id: string;
  backupId: string;
  status: RestoreStatus;
  verificationResult: string | null; // JSON
  performedByUserId: string;
  startedAt: Date;
  completedAt: Date | null;
}

// --- Request DTOs ---

export interface TriggerBackupRequest {
  type?: BackupType;
}

export interface TriggerRestoreRequest {
  backupId: string;
}

// --- Response DTOs ---

export interface BackupRecordResponse {
  id: string;
  type: BackupType;
  status: BackupStatus;
  sizeBytes: string | null;
  startedAt: string;
  completedAt: string | null;
  expiresAt: string;
}

export interface RestoreRunResponse {
  id: string;
  backupId: string;
  status: RestoreStatus;
  verificationResult: Record<string, unknown> | null;
  performedBy: string;
  startedAt: string;
  completedAt: string | null;
}
