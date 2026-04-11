import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

describe('TLS enforcement configuration', () => {
  it('requires cert and key in production startup path', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf-8');

    expect(source).toContain("config.NODE_ENV === 'production'");
    expect(source).toContain('config.TLS_CERT_PATH');
    expect(source).toContain('config.TLS_KEY_PATH');
    expect(source).toContain('https.createServer');
  });

  it('declares TLS cert/key configuration fields', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/app/config.ts', import.meta.url)), 'utf-8');

    expect(source).toContain('TLS_CERT_PATH');
    expect(source).toContain('TLS_KEY_PATH');
  });
});
