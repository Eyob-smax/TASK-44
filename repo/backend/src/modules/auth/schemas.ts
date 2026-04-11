import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const createUserSchema = z.object({
  username: z.string().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Username must contain only letters, numbers, dots, dashes, and underscores'),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(200),
  // Role IDs are seeded string identifiers (e.g., role-opsmanager), not strict UUIDs.
  roleIds: z.array(z.string().min(1).max(36).regex(/^[a-zA-Z0-9_-]+$/, 'Role ID format is invalid')).min(1),
  orgId: z.string().min(1).max(36).optional(),
});

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.string().uuid()).min(1).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});
