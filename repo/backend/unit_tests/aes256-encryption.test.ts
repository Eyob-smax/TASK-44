import { describe, it, expect, beforeAll, vi } from 'vitest';

// Stub config before importing the encryption module
beforeAll(() => {
  vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
  vi.stubEnv('JWT_SECRET', 'test-jwt-secret-value');
  vi.stubEnv('AES_KEY', 'a'.repeat(64)); // valid 32-byte hex
});

const { encrypt, decrypt, hashField } = await import('../src/common/encryption/aes256.js');

describe('AES-256-GCM encrypt/decrypt', () => {
  it('round-trips plaintext correctly', () => {
    const original = 'sensitive data 123';
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('produces different ciphertexts for the same plaintext (unique IV per call)', () => {
    const plaintext = 'same input';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('encrypted string has three colon-separated segments (iv:tag:ciphertext)', () => {
    const encrypted = encrypt('hello');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
    expect(parts[2]!.length).toBeGreaterThan(0);
  });

  it('throws when authTag is tampered with', () => {
    const encrypted = encrypt('tamper test');
    const parts = encrypted.split(':');
    // Corrupt the auth tag (second segment)
    const badTag = Buffer.from('AAAAAAAAAAAAAAAA').toString('base64');
    const tampered = `${parts[0]}:${badTag}:${parts[2]}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws for malformed encrypted string', () => {
    expect(() => decrypt('not-valid-format')).toThrow();
  });

  it('round-trips empty string', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('round-trips unicode content', () => {
    const text = '日本語テキスト 🔒';
    expect(decrypt(encrypt(text))).toBe(text);
  });
});

describe('hashField', () => {
  it('produces a hex string', () => {
    const result = hashField('somevalue');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic — same input yields same output', () => {
    expect(hashField('abc')).toBe(hashField('abc'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashField('a')).not.toBe(hashField('b'));
  });

  it('produces a 64-character SHA-256 hex string', () => {
    expect(hashField('test')).toHaveLength(64);
  });
});
