import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateIdempotencyKey } from '../src/utils/idempotency.js';

// Polyfill crypto.randomUUID for test environments that may not have it
if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => {
        const hex = () => Math.floor(Math.random() * 16).toString(16);
        return `${Array.from({ length: 8 }, hex).join('')}-${Array.from({ length: 4 }, hex).join('')}-4${Array.from({ length: 3 }, hex).join('')}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${Array.from({ length: 3 }, hex).join('')}-${Array.from({ length: 12 }, hex).join('')}`;
      },
    },
  });
}

describe('generateIdempotencyKey', () => {
  it('returns a non-empty string', () => {
    const key = generateIdempotencyKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('returns a key of at least 16 characters', () => {
    const key = generateIdempotencyKey();
    expect(key.length).toBeGreaterThanOrEqual(16);
  });

  it('returns a key within the 64-character backend limit', () => {
    const key = generateIdempotencyKey();
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it('returns a different key on each call', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateIdempotencyKey()));
    expect(keys.size).toBe(20);
  });

  it('matches UUID v4 format', () => {
    const key = generateIdempotencyKey();
    // UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('duplicate-submit protection pattern', () => {
  it('locks submission by tracking an in-flight idempotency key', async () => {
    let callCount = 0;

    // Simulates a form submit handler with duplicate-submit protection
    async function submitWithProtection(
      key: string,
      inFlight: Set<string>,
    ): Promise<string | null> {
      if (inFlight.has(key)) return null; // already submitted
      inFlight.add(key);
      callCount++;
      // Simulate async operation
      await Promise.resolve();
      inFlight.delete(key);
      return 'result';
    }

    const inFlight = new Set<string>();
    const key = generateIdempotencyKey();

    // First call should succeed
    const p1 = submitWithProtection(key, inFlight);
    // Second call with same key while first is in-flight should be rejected
    const p2 = submitWithProtection(key, inFlight);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe('result');
    expect(r2).toBeNull();
    expect(callCount).toBe(1);
  });

  it('allows re-submission after previous submission completes with a new key', async () => {
    let callCount = 0;

    async function submit(key: string, inFlight: Set<string>): Promise<string | null> {
      if (inFlight.has(key)) return null;
      inFlight.add(key);
      callCount++;
      await Promise.resolve();
      inFlight.delete(key);
      return 'result';
    }

    const inFlight = new Set<string>();
    const key1 = generateIdempotencyKey();
    await submit(key1, inFlight);

    const key2 = generateIdempotencyKey();
    const result = await submit(key2, inFlight);

    expect(result).toBe('result');
    expect(callCount).toBe(2);
  });
});
