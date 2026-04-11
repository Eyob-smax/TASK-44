import { describe, it, expect } from 'vitest';

// Extract the pure sanitization logic for unit testing without a live Winston instance.
// Mirrors the logic in logger.ts exactly.

const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'salt',
  'token',
  'secret',
  'key',
  'authorization',
  'encryptedbalance',
  'connectorconfig',
  'aeskey',
  'jwtsecret',
]);

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g;

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(BEARER_PATTERN, 'Bearer [REDACTED]');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = sanitizeValue(v);
    }
  }
  return result;
}

describe('Log sanitization — sensitive field names', () => {
  it('redacts "password" field', () => {
    const out = sanitizeObject({ password: 'mypass123' });
    expect(out['password']).toBe('[REDACTED]');
  });

  it('redacts "passwordHash" field (case-insensitive match)', () => {
    const out = sanitizeObject({ passwordHash: '$2b$12$abc' });
    expect(out['passwordHash']).toBe('[REDACTED]');
  });

  it('redacts "salt" field', () => {
    const out = sanitizeObject({ salt: 'random-salt' });
    expect(out['salt']).toBe('[REDACTED]');
  });

  it('redacts "token" field', () => {
    const out = sanitizeObject({ token: 'eyJhbGciOiJIUzI1NiJ9' });
    expect(out['token']).toBe('[REDACTED]');
  });

  it('redacts "authorization" field', () => {
    const out = sanitizeObject({ authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9' });
    expect(out['authorization']).toBe('[REDACTED]');
  });

  it('redacts nested "secret" field', () => {
    const out = sanitizeObject({ config: { secret: 'top-secret' } }) as Record<string, unknown>;
    const config = out['config'] as Record<string, unknown>;
    expect(config['secret']).toBe('[REDACTED]');
  });

  it('preserves non-sensitive field "username"', () => {
    const out = sanitizeObject({ username: 'alice', password: 'abc' });
    expect(out['username']).toBe('alice');
  });
});

describe('Log sanitization — Bearer token in string values', () => {
  it('redacts Bearer token from string fields', () => {
    const result = sanitizeValue('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def');
    expect(result).toBe('Authorization: Bearer [REDACTED]');
  });

  it('does not alter strings without Bearer token', () => {
    const result = sanitizeValue('just a normal log message');
    expect(result).toBe('just a normal log message');
  });
});
