import { z } from 'zod';

// --- Pagination & Sorting ---

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

// --- Idempotency ---

export const idempotencyKeyHeader = z.string().min(1).max(64);

// --- File Upload ---

export const ACCEPTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const fileUploadMetadataSchema = z.object({
  originalName: z.string().min(1).max(500),
  mimeType: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_SIZE_BYTES),
});

// --- Common field patterns ---

export const uuidSchema = z.string().uuid();

export const zipCodeSchema = z.string().regex(/^\d{5}(-\d{4})?$/, 'Must be a valid 5-digit or 9-digit ZIP code');

export const nonEmptyString = z.string().min(1).max(5000);

export const monetaryAmount = z.number().min(0).max(999999.99);

export const positiveMonetaryAmount = z.number().gt(0).max(999999.99);

// --- Error Envelope ---

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
  requestId?: string;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
  };
}
