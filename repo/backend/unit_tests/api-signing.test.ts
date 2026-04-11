import { describe, it, expect } from 'vitest';
import { signRequest, verifySignature, generateSigningSecret } from '../src/common/signing/api-signer.js';

const SECRET = 'test-signing-secret-abc123';
const PAYLOAD = '{"action":"create","resource":"student"}';

describe('signRequest', () => {
  it('returns a non-empty lowercase hex string', () => {
    const sig = signRequest(PAYLOAD, SECRET, Date.now());
    expect(sig).toMatch(/^[0-9a-f]+$/);
    expect(sig.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same inputs', () => {
    const ts = 1700000000000;
    const s1 = signRequest(PAYLOAD, SECRET, ts);
    const s2 = signRequest(PAYLOAD, SECRET, ts);
    expect(s1).toBe(s2);
  });

  it('differs for different timestamps', () => {
    const s1 = signRequest(PAYLOAD, SECRET, 1000);
    const s2 = signRequest(PAYLOAD, SECRET, 2000);
    expect(s1).not.toBe(s2);
  });

  it('differs for different payloads', () => {
    const ts = Date.now();
    const s1 = signRequest('payload1', SECRET, ts);
    const s2 = signRequest('payload2', SECRET, ts);
    expect(s1).not.toBe(s2);
  });
});

describe('verifySignature', () => {
  it('round-trip: sign then verify returns true', () => {
    const ts = Date.now();
    const sig = signRequest(PAYLOAD, SECRET, ts);
    expect(verifySignature(PAYLOAD, SECRET, sig, ts)).toBe(true);
  });

  it('returns false for tampered payload', () => {
    const ts = Date.now();
    const sig = signRequest(PAYLOAD, SECRET, ts);
    expect(verifySignature('{"tampered":true}', SECRET, sig, ts)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const ts = Date.now();
    const sig = signRequest(PAYLOAD, SECRET, ts);
    expect(verifySignature(PAYLOAD, 'wrong-secret', sig, ts)).toBe(false);
  });

  it('returns false when timestamp is more than 5 minutes in the past', () => {
    const oldTs = Date.now() - 6 * 60 * 1000;
    const sig = signRequest(PAYLOAD, SECRET, oldTs);
    expect(verifySignature(PAYLOAD, SECRET, sig, oldTs)).toBe(false);
  });

  it('returns false when timestamp is more than 5 minutes in the future', () => {
    const futureTs = Date.now() + 6 * 60 * 1000;
    const sig = signRequest(PAYLOAD, SECRET, futureTs);
    expect(verifySignature(PAYLOAD, SECRET, sig, futureTs)).toBe(false);
  });

  it('returns true for timestamp within the 5-minute window', () => {
    const ts = Date.now() - 2 * 60 * 1000; // 2 minutes ago
    const sig = signRequest(PAYLOAD, SECRET, ts);
    expect(verifySignature(PAYLOAD, SECRET, sig, ts)).toBe(true);
  });

  it('returns false for a signature with different length (length check before timingSafeEqual)', () => {
    const ts = Date.now();
    expect(verifySignature(PAYLOAD, SECRET, 'abc', ts)).toBe(false);
  });
});

describe('generateSigningSecret', () => {
  it('returns a 64-character hex string', () => {
    const secret = generateSigningSecret();
    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[0-9a-f]+$/);
  });

  it('generates unique secrets on each call', () => {
    const s1 = generateSigningSecret();
    const s2 = generateSigningSecret();
    expect(s1).not.toBe(s2);
  });
});
