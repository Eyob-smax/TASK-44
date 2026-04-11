/**
 * Generates a unique idempotency key using the browser crypto API.
 * Keys are 36-char UUIDs — well within the backend's 64-char limit.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
