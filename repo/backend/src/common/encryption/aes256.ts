import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { config } from '../../app/config.js';
import { InternalError } from '../errors/app-errors.js';

let KEY: Buffer;

function getKey(): Buffer {
  if (!KEY) {
    KEY = Buffer.from(config.AES_KEY, 'hex');
    if (KEY.length !== 32) {
      throw new InternalError('AES_KEY must decode to exactly 32 bytes');
    }
  }
  return KEY;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(
    ':',
  );
}

export function decrypt(encryptedData: string): string {
  const key = getKey();
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new InternalError('Invalid encrypted data format');
  }

  const [ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64!, 'base64');
  const authTag = Buffer.from(tagB64!, 'base64');
  const ciphertext = Buffer.from(cipherB64!, 'base64');

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new InternalError('Decryption failed — authentication tag verification error');
  }
}

export function hashField(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
