import { db } from '../app/container.js';

export async function enqueueJob(
  type: string,
  payload: object,
  scheduledAt?: Date,
): Promise<string> {
  const job = await db.backgroundJob.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      status: 'pending',
      scheduledAt: scheduledAt ?? new Date(),
    },
  });
  return job.id;
}

export async function claimNextJob(
  type: string,
): Promise<{ id: string; payload: object } | null> {
  return db.$transaction(async (tx) => {
    const job = await tx.backgroundJob.findFirst({
      where: { type, status: 'pending' },
      orderBy: { scheduledAt: 'asc' },
    });

    if (!job) return null;

    await tx.backgroundJob.update({
      where: { id: job.id },
      data: { status: 'running', startedAt: new Date() },
    });

    return { id: job.id, payload: JSON.parse(job.payload ?? '{}') as object };
  });
}

export async function markJobCompleted(jobId: string): Promise<void> {
  await db.backgroundJob.update({
    where: { id: jobId },
    data: { status: 'completed', completedAt: new Date() },
  });
}

export async function markJobFailed(jobId: string, errorMessage: string): Promise<void> {
  const job = await db.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });
  const newAttempts = job.attempts + 1;

  await db.backgroundJob.update({
    where: { id: jobId },
    data: {
      attempts: newAttempts,
      lastError: errorMessage,
      status: newAttempts < job.maxAttempts ? 'pending' : 'failed',
    },
  });
}

export async function getJobStatus(jobId: string) {
  return db.backgroundJob.findUnique({ where: { id: jobId } });
}
