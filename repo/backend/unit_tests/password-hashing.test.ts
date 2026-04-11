import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';

vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-value');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('BCRYPT_ROUNDS', '4'); // Low rounds for test speed

const { hashPassword } = await import('../src/modules/auth/service.js');

describe('hashPassword', () => {
  it('returns a non-empty hash and non-empty salt', async () => {
    const { hash, salt } = await hashPassword('MySecret123');
    expect(hash).toBeTruthy();
    expect(hash.length).toBeGreaterThan(0);
    expect(salt).toBeTruthy();
    expect(salt.length).toBeGreaterThan(0);
  });

  it('bcrypt.compare succeeds for correct password', async () => {
    const password = 'CorrectPassword';
    const { hash } = await hashPassword(password);
    const valid = await bcrypt.compare(password, hash);
    expect(valid).toBe(true);
  });

  it('bcrypt.compare fails for wrong password', async () => {
    const { hash } = await hashPassword('RightPassword');
    const valid = await bcrypt.compare('WrongPassword', hash);
    expect(valid).toBe(false);
  });

  it('two hashes of the same password differ (bcrypt internal salt randomness)', async () => {
    const password = 'SamePassword';
    const { hash: h1 } = await hashPassword(password);
    const { hash: h2 } = await hashPassword(password);
    expect(h1).not.toBe(h2);
  });

  it('produces a valid bcrypt hash with cost factor in the string', async () => {
    const { hash } = await hashPassword('TestPass');
    // bcrypt hashes start with $2b$ or $2a$
    expect(hash).toMatch(/^\$2[ab]\$/);
  });
});
