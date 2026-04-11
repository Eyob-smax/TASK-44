import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required — refusing to start with empty secret'),
  INTEGRATION_SIGNING_SECRET: z.string().min(32, 'INTEGRATION_SIGNING_SECRET must be at least 32 characters'),
  AES_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'AES_KEY must be a 64-character hex string (32 bytes)'),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_EXPIRES_IN: z.string().default('8h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(1).max(31).default(12),
  STORAGE_PATH: z.string().default('/data/object-storage'),
  BACKUP_PATH: z.string().default('/data/backups'),
  TLS_CERT_PATH: z.string().optional(),
  TLS_KEY_PATH: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

function loadConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[CampusOps] Startup configuration error:\n${issues}`);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
