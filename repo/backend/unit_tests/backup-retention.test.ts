import { describe, it, expect } from 'vitest';
import { BACKUP_RETENTION_DAYS, BackupStatus, BackupType } from '../src/modules/backups/types.js';

describe('BACKUP_RETENTION_DAYS', () => {
  it('is set to 14 days', () => {
    expect(BACKUP_RETENTION_DAYS).toBe(14);
  });
});

describe('expiresAt calculation', () => {
  it('computes expiresAt as now + 14 days', () => {
    const now = Date.now();
    const expiresAt = new Date(now + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const diffDays = (expiresAt.getTime() - now) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(14, 5);
  });

  it('a backup created now expires in the future', () => {
    const expiresAt = new Date(Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(expiresAt > new Date()).toBe(true);
  });

  it('a backup created 15 days ago would be expired', () => {
    const startedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(startedAt.getTime() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(expiresAt < new Date()).toBe(true);
  });

  it('a backup created 13 days ago is not yet expired', () => {
    const startedAt = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(startedAt.getTime() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(expiresAt > new Date()).toBe(true);
  });
});

describe('BackupStatus enum', () => {
  it('has RUNNING, COMPLETED, FAILED values', () => {
    expect(BackupStatus.RUNNING).toBe('running');
    expect(BackupStatus.COMPLETED).toBe('completed');
    expect(BackupStatus.FAILED).toBe('failed');
  });
});

describe('BackupType enum', () => {
  it('has FULL value', () => {
    expect(BackupType.FULL).toBe('full');
  });
});

describe('restore eligibility', () => {
  it('only completed backups are eligible for restore', () => {
    const isEligibleForRestore = (status: BackupStatus) => status === BackupStatus.COMPLETED;

    expect(isEligibleForRestore(BackupStatus.COMPLETED)).toBe(true);
    expect(isEligibleForRestore(BackupStatus.RUNNING)).toBe(false);
    expect(isEligibleForRestore(BackupStatus.FAILED)).toBe(false);
  });
});
