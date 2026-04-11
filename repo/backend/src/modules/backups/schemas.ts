import { z } from 'zod';

export const triggerBackupSchema = z.object({
  type: z.enum(['full']).default('full'),
});

export const triggerRestoreSchema = z.object({
  backupId: z.string().uuid(),
});
