import { describe, it, expect } from 'vitest';
import { ApiError, ApiErrorCode } from '../src/services/types.js';

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError('VALIDATION_ERROR', 'Invalid input');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of ApiError', () => {
    const err = new ApiError('NOT_FOUND', 'Not found');
    expect(err).toBeInstanceOf(ApiError);
  });

  it('has code field matching constructor argument', () => {
    const err = new ApiError('UNAUTHORIZED', 'Auth required');
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('has message field matching constructor argument', () => {
    const err = new ApiError('FORBIDDEN', 'Access denied');
    expect(err.message).toBe('Access denied');
  });

  it('has details field when provided', () => {
    const details = { email: ['Must be a valid email'] };
    const err = new ApiError('VALIDATION_ERROR', 'Invalid', details);
    expect(err.details).toBeDefined();
    expect(err.details!['email']).toContain('Must be a valid email');
  });

  it('details is undefined when not provided', () => {
    const err = new ApiError('NOT_FOUND', 'Missing');
    expect(err.details).toBeUndefined();
  });

  it('name is "ApiError"', () => {
    const err = new ApiError('CONFLICT', 'Conflict');
    expect(err.name).toBe('ApiError');
  });
});

describe('ApiErrorCode', () => {
  it('contains VALIDATION_ERROR', () => {
    expect(ApiErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
  });

  it('contains UNAUTHORIZED', () => {
    expect(ApiErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
  });

  it('contains FORBIDDEN', () => {
    expect(ApiErrorCode.FORBIDDEN).toBe('FORBIDDEN');
  });

  it('contains NOT_FOUND', () => {
    expect(ApiErrorCode.NOT_FOUND).toBe('NOT_FOUND');
  });

  it('contains CONFLICT', () => {
    expect(ApiErrorCode.CONFLICT).toBe('CONFLICT');
  });

  it('contains RATE_LIMITED', () => {
    expect(ApiErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
  });

  it('contains INTERNAL_ERROR', () => {
    expect(ApiErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});
