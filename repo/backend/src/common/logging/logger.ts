import winston from 'winston';
import TransportStream from 'winston-transport';
import { encrypt } from '../encryption/aes256.js';

class DatabaseTransport extends TransportStream {
  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(callback); // never block the logger
    // Lazy import to avoid circular dependency at module load time
    import('../../app/container.js').then(({ db }) => {
      const { level, message, ...rest } = info;
      const orgId = typeof rest['orgId'] === 'string' ? rest['orgId'] : null;
      const context = { ...rest };
      delete context['orgId'];
      const plainMessage = typeof message === 'string' ? message : JSON.stringify(message);
      const encryptedMessage = encrypt(plainMessage);
      const messageSearch = plainMessage.slice(0, 500);
      const encryptedContext = encrypt(JSON.stringify(context));
      db.applicationLog.create({
        data: {
          level: String(level),
          message: encryptedMessage,
          messageSearch,
          context: encryptedContext,
          orgId,
        },
      }).catch(() => {}); // swallow DB errors — never crash the logger
    }).catch(() => {});
  }
}

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

const sanitizeTransform = winston.format((info) => {
  const sanitized = sanitizeObject(info as unknown as Record<string, unknown>);
  return Object.assign(info, sanitized);
});

const isDev = process.env['NODE_ENV'] === 'development';

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: isDev
    ? winston.format.combine(
        sanitizeTransform(),
        winston.format.colorize(),
        winston.format.simple(),
      )
    : winston.format.combine(sanitizeTransform(), winston.format.json()),
  transports: [
    new winston.transports.Console(),
    new DatabaseTransport({ level: 'info' }),
  ],
}) as any;
