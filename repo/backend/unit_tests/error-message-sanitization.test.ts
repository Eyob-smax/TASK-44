import { describe, expect, it } from 'vitest';
import { sanitizeErrorMessage } from '../src/common/logging/sanitize-error-message.js';

describe('sanitizeErrorMessage', () => {
  it('redacts CLI -p password arguments', () => {
    const raw = 'Command failed: mysql -h localhost -u user -psecretpass db';
    const sanitized = sanitizeErrorMessage(raw);

    expect(sanitized).not.toContain('-psecretpass');
    expect(sanitized).toContain('-p[REDACTED]');
  });

  it('redacts MYSQL_PWD environment fragments', () => {
    const raw = 'Failed with MYSQL_PWD=supersecret and exit code 1';
    const sanitized = sanitizeErrorMessage(raw);

    expect(sanitized).not.toContain('supersecret');
    expect(sanitized).toContain('MYSQL_PWD=[REDACTED]');
  });

  it('redacts password from mysql URL credentials', () => {
    const raw = 'Unable to connect: mysql://user:supersecret@mysql:3306/campusops';
    const sanitized = sanitizeErrorMessage(raw);

    expect(sanitized).not.toContain('supersecret');
    expect(sanitized).toContain('mysql://user:[REDACTED]@mysql:3306/campusops');
  });
});
