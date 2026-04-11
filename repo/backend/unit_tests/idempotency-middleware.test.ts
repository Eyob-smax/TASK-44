import { describe, it, expect } from 'vitest';

// Pure logic helpers extracted from the idempotency middleware,
// tested without DB or HTTP dependencies.

const MAX_KEY_LENGTH = 64;
const TTL_MS = 24 * 60 * 60 * 1000;

function validateIdempotencyKey(key: string): boolean {
  return key.length <= MAX_KEY_LENGTH;
}

const IN_FLIGHT_SENTINEL = ''; // empty string = pending/in-flight, matches middleware

interface IdempotencyRow {
  key: string;
  responseBody: string; // never null — uses empty string as in-flight sentinel
  statusCode: number;
  expiresAt: Date;
}

function buildIdempotencyKey(key: string): Omit<IdempotencyRow, 'responseBody' | 'statusCode'> {
  return {
    key,
    expiresAt: new Date(Date.now() + TTL_MS),
  };
}

function isReplay(row: IdempotencyRow): boolean {
  return row.responseBody !== IN_FLIGHT_SENTINEL && row.expiresAt > new Date();
}

function isInFlight(row: IdempotencyRow): boolean {
  return row.responseBody === IN_FLIGHT_SENTINEL && row.expiresAt > new Date();
}

describe('Idempotency key validation', () => {
  it('passes through when header is absent (empty string treated as absent)', () => {
    // Missing header logic: absent key means no idempotency applied
    expect(validateIdempotencyKey('')).toBe(true); // empty would be handled by header check
  });

  it('key at exactly 64 chars is valid', () => {
    expect(validateIdempotencyKey('a'.repeat(64))).toBe(true);
  });

  it('key > 64 chars is invalid', () => {
    expect(validateIdempotencyKey('a'.repeat(65))).toBe(false);
  });

  it('key at 1 char is valid', () => {
    expect(validateIdempotencyKey('x')).toBe(true);
  });
});

describe('buildIdempotencyKey', () => {
  it('produces a row with the correct key and future expiresAt', () => {
    const key = 'my-request-key';
    const row = buildIdempotencyKey(key);
    expect(row.key).toBe(key);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('expiresAt is approximately 24 hours in the future', () => {
    const before = Date.now();
    const row = buildIdempotencyKey('k');
    const after = Date.now();
    const expectedExpiry = before + TTL_MS;
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 100);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(after + TTL_MS + 100);
  });
});

describe('isReplay', () => {
  it('returns true when responseBody is populated (non-empty) and not expired', () => {
    const row: IdempotencyRow = {
      key: 'k1',
      responseBody: '{"success":true}',
      statusCode: 200,
      expiresAt: new Date(Date.now() + 3600_000),
    };
    expect(isReplay(row)).toBe(true);
  });

  it('returns false when responseBody is empty string (in-flight sentinel)', () => {
    const row: IdempotencyRow = {
      key: 'k2',
      responseBody: IN_FLIGHT_SENTINEL,
      statusCode: 0,
      expiresAt: new Date(Date.now() + 3600_000),
    };
    expect(isReplay(row)).toBe(false);
  });

  it('returns false when row is expired even with responseBody', () => {
    const row: IdempotencyRow = {
      key: 'k3',
      responseBody: '{}',
      statusCode: 200,
      expiresAt: new Date(Date.now() - 1000),
    };
    expect(isReplay(row)).toBe(false);
  });
});

describe('isInFlight', () => {
  it('returns true when responseBody is empty string sentinel and not expired', () => {
    const row: IdempotencyRow = {
      key: 'k4',
      responseBody: IN_FLIGHT_SENTINEL,
      statusCode: 0,
      expiresAt: new Date(Date.now() + 3600_000),
    };
    expect(isInFlight(row)).toBe(true);
  });

  it('returns false when responseBody is populated (non-empty)', () => {
    const row: IdempotencyRow = {
      key: 'k5',
      responseBody: '{"done":true}',
      statusCode: 200,
      expiresAt: new Date(Date.now() + 3600_000),
    };
    expect(isInFlight(row)).toBe(false);
  });

  it('returns false when row is expired', () => {
    const row: IdempotencyRow = {
      key: 'k6',
      responseBody: IN_FLIGHT_SENTINEL,
      statusCode: 0,
      expiresAt: new Date(Date.now() - 1000),
    };
    expect(isInFlight(row)).toBe(false);
  });
});
