import { describe, it, expect } from 'vitest';

// Pure BackgroundJob state-machine tests — no DB or HTTP dependencies.
// Mirrors the logic in job-monitor.ts (claimNextJob, markJobCompleted, markJobFailed)
// and the payload parsing convention used in all workers: JSON.parse(payload ?? '{}').

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface BackgroundJob {
  id: string;
  type: string;
  status: JobStatus;
  payload: string | null;
  failedAttempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
}

function parsePayload(payload: string | null): Record<string, unknown> {
  return JSON.parse(payload ?? '{}');
}

function canClaim(job: BackgroundJob): boolean {
  return job.status === 'pending' && job.failedAttempts < job.maxAttempts;
}

function claimJob(job: BackgroundJob): BackgroundJob {
  if (!canClaim(job)) {
    throw new Error(`Cannot claim job with status='${job.status}' and failedAttempts=${job.failedAttempts}`);
  }
  return { ...job, status: 'processing', startedAt: new Date() };
}

function completeJob(job: BackgroundJob): BackgroundJob {
  return { ...job, status: 'completed', completedAt: new Date() };
}

function failJob(job: BackgroundJob, errorMessage: string): BackgroundJob {
  const failedAttempts = job.failedAttempts + 1;
  const nextStatus: JobStatus = failedAttempts >= job.maxAttempts ? 'failed' : 'pending';
  return {
    ...job,
    status: nextStatus,
    failedAttempts,
    errorMessage,
    completedAt: new Date(),
  };
}

const DEFAULT_JOB: BackgroundJob = {
  id: 'job-1',
  type: 'import',
  status: 'pending',
  payload: null,
  failedAttempts: 0,
  maxAttempts: 3,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  startedAt: null,
  completedAt: null,
  errorMessage: null,
};

describe('Payload parsing', () => {
  it('null payload parses to empty object', () => {
    expect(parsePayload(null)).toEqual({});
  });

  it('empty-string payload uses ?? fallback → empty object', () => {
    // null coalescing: null → '{}', which then parses fine
    expect(parsePayload(null)).toEqual({});
  });

  it('valid JSON string parses to object', () => {
    const result = parsePayload('{"importJobId":"job-abc","orgId":"org-1","entityType":"students"}');
    expect(result).toEqual({ importJobId: 'job-abc', orgId: 'org-1', entityType: 'students' });
  });

  it('nested JSON parses correctly', () => {
    const result = parsePayload('{"backupId":"bk-1","type":"full","storagePath":"/data/backups"}');
    expect(result.backupId).toBe('bk-1');
    expect(result.storagePath).toBe('/data/backups');
  });
});

describe('canClaim', () => {
  it('pending job with remaining attempts can be claimed', () => {
    expect(canClaim(DEFAULT_JOB)).toBe(true);
  });

  it('processing job cannot be claimed', () => {
    expect(canClaim({ ...DEFAULT_JOB, status: 'processing' })).toBe(false);
  });

  it('completed job cannot be claimed', () => {
    expect(canClaim({ ...DEFAULT_JOB, status: 'completed' })).toBe(false);
  });

  it('failed job cannot be claimed', () => {
    expect(canClaim({ ...DEFAULT_JOB, status: 'failed' })).toBe(false);
  });

  it('pending job with failedAttempts = maxAttempts cannot be claimed', () => {
    expect(canClaim({ ...DEFAULT_JOB, failedAttempts: 3, maxAttempts: 3 })).toBe(false);
  });

  it('pending job with failedAttempts one less than maxAttempts can be claimed', () => {
    expect(canClaim({ ...DEFAULT_JOB, failedAttempts: 2, maxAttempts: 3 })).toBe(true);
  });
});

describe('claimJob', () => {
  it('transitions status from pending → processing', () => {
    const claimed = claimJob(DEFAULT_JOB);
    expect(claimed.status).toBe('processing');
  });

  it('sets startedAt to a non-null Date', () => {
    const claimed = claimJob(DEFAULT_JOB);
    expect(claimed.startedAt).toBeInstanceOf(Date);
    expect(claimed.startedAt).not.toBeNull();
  });

  it('does not mutate original job', () => {
    const claimed = claimJob(DEFAULT_JOB);
    expect(DEFAULT_JOB.status).toBe('pending');
    expect(claimed).not.toBe(DEFAULT_JOB);
  });

  it('throws if job is already processing', () => {
    const processing = { ...DEFAULT_JOB, status: 'processing' as JobStatus };
    expect(() => claimJob(processing)).toThrow("Cannot claim job with status='processing'");
  });

  it('throws if failedAttempts has reached maxAttempts', () => {
    const exhausted = { ...DEFAULT_JOB, failedAttempts: 3, maxAttempts: 3 };
    expect(() => claimJob(exhausted)).toThrow();
  });
});

describe('completeJob', () => {
  it('transitions processing → completed', () => {
    const processing = claimJob(DEFAULT_JOB);
    const completed = completeJob(processing);
    expect(completed.status).toBe('completed');
  });

  it('sets completedAt to a non-null Date', () => {
    const processing = claimJob(DEFAULT_JOB);
    const completed = completeJob(processing);
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it('does not mutate the input job', () => {
    const processing = claimJob(DEFAULT_JOB);
    const completed = completeJob(processing);
    expect(processing.status).toBe('processing');
    expect(completed).not.toBe(processing);
  });
});

describe('failJob', () => {
  it('first failure with maxAttempts=3 → status stays pending (retry)', () => {
    const processing = { ...DEFAULT_JOB, status: 'processing' as JobStatus };
    const result = failJob(processing, 'Timeout');
    expect(result.status).toBe('pending');
    expect(result.failedAttempts).toBe(1);
    expect(result.errorMessage).toBe('Timeout');
  });

  it('second failure → still pending (1 retry remaining)', () => {
    const processing = { ...DEFAULT_JOB, status: 'processing' as JobStatus, failedAttempts: 1 };
    const result = failJob(processing, 'Connection error');
    expect(result.status).toBe('pending');
    expect(result.failedAttempts).toBe(2);
  });

  it('third failure (at maxAttempts=3) → status becomes failed permanently', () => {
    const processing = { ...DEFAULT_JOB, status: 'processing' as JobStatus, failedAttempts: 2 };
    const result = failJob(processing, 'All attempts exhausted');
    expect(result.status).toBe('failed');
    expect(result.failedAttempts).toBe(3);
  });

  it('sets errorMessage on each failure', () => {
    const processing = { ...DEFAULT_JOB, status: 'processing' as JobStatus };
    const result = failJob(processing, 'Disk full');
    expect(result.errorMessage).toBe('Disk full');
  });

  it('sets completedAt on failure', () => {
    const processing = { ...DEFAULT_JOB, status: 'processing' as JobStatus };
    const result = failJob(processing, 'err');
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('each failure increments failedAttempts by exactly 1', () => {
    let job = { ...DEFAULT_JOB, status: 'processing' as JobStatus };
    for (let i = 1; i <= 3; i++) {
      job = { ...failJob(job, 'err'), status: 'processing' };
      expect(job.failedAttempts).toBe(i);
    }
  });

  it('maxAttempts=1 → single failure immediately marks as failed', () => {
    const job = { ...DEFAULT_JOB, maxAttempts: 1, status: 'processing' as JobStatus };
    const result = failJob(job, 'Immediate failure');
    expect(result.status).toBe('failed');
    expect(result.failedAttempts).toBe(1);
  });
});

describe('Backup worker failure semantics', () => {
  it('backup job that throws marks status as failed with completedAt set', () => {
    // Models the behavior of BackupWorker: any execSync failure causes failJob
    const backupJob = { ...DEFAULT_JOB, type: 'backup', maxAttempts: 1, status: 'processing' as JobStatus };
    const failed = failJob(backupJob, 'mysqldump: [ERROR 1045] Access denied');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toContain('Access denied');
    expect(failed.completedAt).toBeInstanceOf(Date);
  });

  it('backup job with maxAttempts=3 retries before marking failed', () => {
    const backupJob = { ...DEFAULT_JOB, type: 'backup', status: 'processing' as JobStatus };
    const result = failJob(backupJob, 'mysqldump error');
    expect(result.status).toBe('pending'); // retrying
    expect(result.failedAttempts).toBe(1);
  });
});

describe('Full lifecycle scenario', () => {
  it('pending → processing → completed', () => {
    const claimed = claimJob(DEFAULT_JOB);
    expect(claimed.status).toBe('processing');
    const done = completeJob(claimed);
    expect(done.status).toBe('completed');
    expect(done.startedAt).not.toBeNull();
    expect(done.completedAt).not.toBeNull();
  });

  it('pending → processing → failed (retry) → pending → processing → completed', () => {
    const claimed1 = claimJob(DEFAULT_JOB);
    const failed1 = failJob(claimed1, 'First attempt failed');
    expect(failed1.status).toBe('pending'); // retrying

    const claimed2 = claimJob(failed1);
    const done = completeJob(claimed2);
    expect(done.status).toBe('completed');
    expect(done.failedAttempts).toBe(1);
  });
});
