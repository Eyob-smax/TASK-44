import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export function signRequest(payload: string, secret: string, timestampMs: number): string {
  return createHmac('sha256', secret)
    .update(`${timestampMs}:${payload}`)
    .digest('hex')
    .toLowerCase();
}

export function verifySignature(
  payload: string,
  secret: string,
  signature: string,
  timestampMs: number,
  maxAgeMs = 5 * 60 * 1000,
): boolean {
  if (Math.abs(Date.now() - timestampMs) > maxAgeMs) {
    return false;
  }

  const expected = signRequest(payload, secret, timestampMs);

  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(signature.toLowerCase(), 'hex');

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

export function generateSigningSecret(): string {
  return randomBytes(32).toString('hex');
}
