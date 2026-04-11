import { Request, Response, NextFunction } from 'express';
import { db } from '../../app/container.js';
import { hashField } from '../encryption/aes256.js';
import { MaskType } from '../../modules/auth/types.js';

interface CacheEntry {
  rules: Array<{ fieldName: string; maskType: MaskType }>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

async function getRules(
  roleId: string,
  resource: string,
): Promise<Array<{ fieldName: string; maskType: MaskType }>> {
  const cacheKey = `${roleId}:${resource}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.rules;
  }

  const rows = await db.fieldMaskingRule.findMany({
    where: { roleId, resource },
    select: { field: true, maskType: true },
  });

  const rules = rows.map((r) => ({ fieldName: r.field, maskType: r.maskType as MaskType }));
  cache.set(cacheKey, { rules, expiresAt: now + CACHE_TTL_MS });
  return rules;
}

function applyMask(value: unknown, maskType: MaskType): unknown {
  if (maskType === MaskType.FULL) {
    return '***';
  }

  if (maskType === MaskType.PARTIAL) {
    const str = String(value);
    if (str.length <= 4) return '***';
    return '****' + str.slice(-4);
  }

  if (maskType === MaskType.HASH) {
    return hashField(String(value)).slice(0, 12);
  }

  return value;
}

function maskObject(
  obj: Record<string, unknown>,
  rules: Array<{ fieldName: string; maskType: MaskType }>,
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj;

  const result = { ...obj };
  for (const rule of rules) {
    if (rule.fieldName in result) {
      result[rule.fieldName] = applyMask(result[rule.fieldName], rule.maskType);
    }
  }
  return result;
}

function maskRecursively(
  value: unknown,
  rules: Array<{ fieldName: string; maskType: MaskType }>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskRecursively(item, rules));
  }

  if (value && typeof value === 'object') {
    const maskedRoot = maskObject(value as Record<string, unknown>, rules);
    const result: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(maskedRoot)) {
      result[k] = maskRecursively(v, rules);
    }

    return result;
  }

  return value;
}

export function applyFieldMasking(resource: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next();
      return;
    }

    // Administrator bypasses all masking
    if (req.user.roles.includes('Administrator')) {
      next();
      return;
    }

    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
      if (!req.user || !body || typeof body !== 'object') {
        return originalJson(body);
      }

      const primaryRole = req.user.roles[0];
      if (!primaryRole) {
        return originalJson(body);
      }

      const envelope = body as Record<string, unknown>;
      const payload = envelope['data'];

      // Perform async masking — we need to look up the role ID
      db.role
        .findFirst({ where: { name: primaryRole }, select: { id: true } })
        .then((role) => {
          if (!role) {
            return originalJson(body);
          }
          return getRules(role.id, resource).then((rules) => {
            if (rules.length === 0) {
              return originalJson(body);
            }
            const masked = maskRecursively(payload, rules);
            return originalJson({ ...envelope, data: masked });
          });
        })
        .catch(() => originalJson(body));

      return res;
    };

    next();
  };
}
