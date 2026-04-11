import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { ApiError } from '../src/services/types.js';
import { apiClient, get } from '../src/services/api-client.js';

// We test the error normalization logic directly since the Axios interceptor
// is registered on module load. We simulate the error transformation that the
// response interceptor applies.

function normalizeAxiosError(status: number, errorBody: Record<string, unknown>): ApiError {
  const code =
    errorBody['code'] ??
    (status === 401
      ? 'UNAUTHORIZED'
      : status === 403
        ? 'FORBIDDEN'
        : status === 404
          ? 'NOT_FOUND'
          : status === 409
            ? 'CONFLICT'
            : status === 422
              ? 'UNPROCESSABLE'
              : status === 429
                ? 'RATE_LIMITED'
                : 'INTERNAL_ERROR');
  const message = (errorBody['message'] as string) ?? 'An unexpected error occurred';
  const details = errorBody['details'] as Record<string, string[]> | undefined;
  return new ApiError(code as string, message, details);
}

describe('API error normalization', () => {
  it('maps HTTP 401 to UNAUTHORIZED when no error body code', () => {
    const err = normalizeAxiosError(401, {});
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err).toBeInstanceOf(ApiError);
  });

  it('maps HTTP 403 to FORBIDDEN', () => {
    const err = normalizeAxiosError(403, {});
    expect(err.code).toBe('FORBIDDEN');
  });

  it('maps HTTP 404 to NOT_FOUND', () => {
    const err = normalizeAxiosError(404, {});
    expect(err.code).toBe('NOT_FOUND');
  });

  it('maps HTTP 409 to CONFLICT', () => {
    const err = normalizeAxiosError(409, {});
    expect(err.code).toBe('CONFLICT');
  });

  it('maps HTTP 422 to UNPROCESSABLE', () => {
    const err = normalizeAxiosError(422, {});
    expect(err.code).toBe('UNPROCESSABLE');
  });

  it('maps HTTP 429 to RATE_LIMITED', () => {
    const err = normalizeAxiosError(429, {});
    expect(err.code).toBe('RATE_LIMITED');
  });

  it('maps HTTP 500 to INTERNAL_ERROR', () => {
    const err = normalizeAxiosError(500, {});
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('uses error body code when provided', () => {
    const err = normalizeAxiosError(400, { code: 'VALIDATION_ERROR', message: 'Bad input' });
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('uses error body message', () => {
    const err = normalizeAxiosError(422, { message: 'Insufficient balance' });
    expect(err.message).toBe('Insufficient balance');
  });

  it('attaches details when present in error body', () => {
    const details = { email: ['Invalid format'] };
    const err = normalizeAxiosError(400, {
      code: 'VALIDATION_ERROR',
      message: 'Bad input',
      details,
    });
    expect(err.details).toEqual(details);
  });

  it('returns ApiError instance (not plain Error)', () => {
    const err = normalizeAxiosError(500, {});
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
  });
});

describe('ApiError properties', () => {
  it('code field is accessible', () => {
    const err = new ApiError('FORBIDDEN', 'Access denied');
    expect(err.code).toBe('FORBIDDEN');
  });

  it('details field is undefined when not provided', () => {
    const err = new ApiError('NOT_FOUND', 'Missing');
    expect(err.details).toBeUndefined();
  });

  it('details field is accessible when provided', () => {
    const err = new ApiError('VALIDATION_ERROR', 'Bad', { field: ['error'] });
    expect(err.details?.['field']).toEqual(['error']);
  });
});

describe('Real interceptor — adapter-level error injection', () => {
  // Save and restore the adapter so tests do not affect each other
  const savedAdapter = (apiClient.defaults as any).adapter;

  afterEach(() => {
    (apiClient.defaults as any).adapter = savedAdapter;
  });

  function makeAdapter(status: number, errorBody: Record<string, unknown> = {}) {
    return async (_config: unknown) => {
      throw Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { status, data: { error: errorBody } },
      });
    };
  }

  it('get() throws ApiError instance via real registered interceptor on 401', async () => {
    (apiClient.defaults as any).adapter = makeAdapter(401);
    const err = await get('/test').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('get() uses body error code via real interceptor when provided', async () => {
    (apiClient.defaults as any).adapter = makeAdapter(400, { code: 'VALIDATION_ERROR', message: 'Bad input' });
    const err = await get('/test').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Bad input');
  });

  it('get() throws INTERNAL_ERROR via real interceptor for network errors', async () => {
    (apiClient.defaults as any).adapter = async (_config: unknown) => {
      throw Object.assign(new Error('Network Error'), { isAxiosError: true });
    };
    const err = await get('/test').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});
