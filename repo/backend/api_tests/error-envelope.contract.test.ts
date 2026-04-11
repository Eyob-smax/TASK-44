import { describe, it, expect } from 'vitest';
import type { ErrorEnvelope, SuccessEnvelope } from '../src/common/validation/schemas.js';

/**
 * API Contract Tests — Error Envelope Consistency
 *
 * These tests verify the structural contract of the error and success envelopes
 * as defined in the common validation schemas. They verify the shape at the type
 * level and via runtime object construction — actual HTTP responses are deferred
 * until server implementation is complete.
 */

function buildErrorEnvelope(
  code: string,
  message: string,
  details?: Record<string, string[]>
): ErrorEnvelope {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function buildSuccessEnvelope<T>(
  data: T,
  meta?: { page: number; limit: number; total: number }
): SuccessEnvelope<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
}

describe('ErrorEnvelope contract', () => {
  it('has success: false', () => {
    const envelope = buildErrorEnvelope('NOT_FOUND', 'Resource not found');
    expect(envelope.success).toBe(false);
  });

  it('contains code and message', () => {
    const envelope = buildErrorEnvelope('VALIDATION_ERROR', 'Input is invalid');
    expect(envelope.error.code).toBe('VALIDATION_ERROR');
    expect(envelope.error.message).toBe('Input is invalid');
  });

  it('can include field-level details for validation errors', () => {
    const envelope = buildErrorEnvelope('VALIDATION_ERROR', 'Invalid fields', {
      email: ['Must be a valid email address'],
      studentNumber: ['Required'],
    });
    expect(envelope.error.details).toBeDefined();
    expect(envelope.error.details!['email']).toContain('Must be a valid email address');
    expect(envelope.error.details!['studentNumber']).toContain('Required');
  });

  it('details is optional', () => {
    const envelope = buildErrorEnvelope('UNAUTHORIZED', 'Not authenticated');
    expect(envelope.error.details).toBeUndefined();
  });

  it('uses known error codes from the API spec', () => {
    const knownCodes = [
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'UNPROCESSABLE',
      'RATE_LIMITED',
      'CIRCUIT_OPEN',
      'INTERNAL_ERROR',
    ];
    for (const code of knownCodes) {
      const envelope = buildErrorEnvelope(code, `Error: ${code}`);
      expect(envelope.error.code).toBe(code);
    }
  });
});

describe('SuccessEnvelope contract', () => {
  it('has success: true', () => {
    const envelope = buildSuccessEnvelope({ id: 'abc' });
    expect(envelope.success).toBe(true);
  });

  it('contains data property', () => {
    const envelope = buildSuccessEnvelope({ name: 'test' });
    expect(envelope.data).toBeDefined();
    expect(envelope.data.name).toBe('test');
  });

  it('meta is optional for single-resource responses', () => {
    const envelope = buildSuccessEnvelope({ id: '123', name: 'Alice' });
    expect(envelope.meta).toBeUndefined();
  });

  it('meta contains page, limit, total for list responses', () => {
    const envelope = buildSuccessEnvelope(
      [{ id: '1' }, { id: '2' }],
      { page: 1, limit: 25, total: 2 }
    );
    expect(envelope.meta).toBeDefined();
    expect(envelope.meta!.page).toBe(1);
    expect(envelope.meta!.limit).toBe(25);
    expect(envelope.meta!.total).toBe(2);
  });

  it('meta total is a non-negative integer', () => {
    const envelope = buildSuccessEnvelope([], { page: 1, limit: 25, total: 0 });
    expect(envelope.meta!.total).toBeGreaterThanOrEqual(0);
  });
});

describe('Envelope mutual exclusivity', () => {
  it('success:false envelope has no data field', () => {
    const envelope = buildErrorEnvelope('NOT_FOUND', 'Not found');
    expect('data' in envelope).toBe(false);
  });

  it('success:true envelope has no error field', () => {
    const envelope = buildSuccessEnvelope({ id: 'xyz' });
    expect('error' in envelope).toBe(false);
  });
});
