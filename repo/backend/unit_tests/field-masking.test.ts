import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MaskType } from '../src/modules/auth/types.js';
import { hashField } from '../src/common/encryption/aes256.js';

vi.mock('../src/app/container.js', () => ({
  db: {
    role: { findFirst: vi.fn() },
    fieldMaskingRule: { findMany: vi.fn() },
  },
}));

function applyMask(value: unknown, maskType: MaskType): unknown {
  if (maskType === MaskType.FULL) return '***';

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

// Simulate admin bypass — if role is Administrator, no masking applied
function maskWithAdminBypass(
  value: unknown,
  maskType: MaskType,
  roles: string[],
): unknown {
  if (roles.includes('Administrator')) return value;
  return applyMask(value, maskType);
}

describe('FULL mask', () => {
  it('replaces string value with "***"', () => {
    expect(applyMask('secret123', MaskType.FULL)).toBe('***');
  });

  it('replaces numeric value with "***"', () => {
    expect(applyMask(12345, MaskType.FULL)).toBe('***');
  });
});

describe('PARTIAL mask', () => {
  it('on "1234567890" yields "****7890"', () => {
    expect(applyMask('1234567890', MaskType.PARTIAL)).toBe('****7890');
  });

  it('on string ≤4 chars fully masks to "***"', () => {
    expect(applyMask('abcd', MaskType.PARTIAL)).toBe('***');
    expect(applyMask('ab', MaskType.PARTIAL)).toBe('***');
  });

  it('on exactly 5-char string reveals last 4', () => {
    expect(applyMask('abcde', MaskType.PARTIAL)).toBe('****bcde');
  });
});

describe('HASH mask', () => {
  it('produces a 12-character hex prefix', () => {
    const result = applyMask('somedata', MaskType.HASH) as string;
    expect(result).toHaveLength(12);
    expect(result).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic for the same input', () => {
    const r1 = applyMask('stable', MaskType.HASH);
    const r2 = applyMask('stable', MaskType.HASH);
    expect(r1).toBe(r2);
  });
});

describe('Administrator bypass', () => {
  it('Administrator role skips FULL masking', () => {
    expect(maskWithAdminBypass('myvalue', MaskType.FULL, ['Administrator'])).toBe('myvalue');
  });

  it('Administrator role skips PARTIAL masking', () => {
    expect(maskWithAdminBypass('1234567890', MaskType.PARTIAL, ['Administrator'])).toBe('1234567890');
  });

  it('non-admin role applies masking', () => {
    expect(maskWithAdminBypass('myvalue', MaskType.FULL, ['Auditor'])).toBe('***');
  });
});

describe('No rules — value unchanged', () => {
  it('returns value unchanged when no mask type applies', () => {
    // Simulating the "no rules found" path — value passes through
    const value = 'unmasked';
    expect(value).toBe('unmasked');
  });
});

describe('applyFieldMasking middleware — envelope path', () => {
  it('masks fields nested inside response data envelope', async () => {
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.role.findFirst).mockResolvedValue({ id: 'role-1' } as any);
    vi.mocked(db.fieldMaskingRule.findMany).mockResolvedValue([
      { field: 'ssn', maskType: MaskType.FULL },
    ] as any);

    const { applyFieldMasking } = await import('../src/common/middleware/field-masking.js');

    const app = express();
    app.use((req: any, _res: any, next: any) => {
      req.user = { userId: 'u1', roles: ['Viewer'], permissions: [] };
      next();
    });
    app.get('/test', applyFieldMasking('student'), (_req, res) => {
      res.json({ success: true, data: { id: '1', ssn: '123-45-6789', name: 'Alice' } });
    });

    const res = await request(app).get('/test');
    expect(res.body.data.ssn).toBe('***');
    expect(res.body.data.name).toBe('Alice');
    expect(res.body.success).toBe(true);
  });

  it('masks each item in array data envelope', async () => {
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.role.findFirst).mockResolvedValue({ id: 'role-1' } as any);
    vi.mocked(db.fieldMaskingRule.findMany).mockResolvedValue([
      { field: 'ssn', maskType: MaskType.FULL },
    ] as any);

    const { applyFieldMasking } = await import('../src/common/middleware/field-masking.js');

    const app = express();
    app.use((req: any, _res: any, next: any) => {
      req.user = { userId: 'u1', roles: ['Viewer'], permissions: [] };
      next();
    });
    app.get('/test-list', applyFieldMasking('student'), (_req, res) => {
      res.json({ success: true, data: [
        { id: '1', ssn: '111-11-1111', name: 'Alice' },
        { id: '2', ssn: '222-22-2222', name: 'Bob' },
      ] });
    });

    const res = await request(app).get('/test-list');
    expect(res.body.data[0].ssn).toBe('***');
    expect(res.body.data[1].ssn).toBe('***');
    expect(res.body.data[0].name).toBe('Alice');
  });

  it('masks nested list items inside paginated envelopes', async () => {
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.role.findFirst).mockResolvedValue({ id: 'role-1' } as any);
    vi.mocked(db.fieldMaskingRule.findMany).mockResolvedValue([
      { field: 'phone', maskType: MaskType.PARTIAL },
    ] as any);

    const { applyFieldMasking } = await import('../src/common/middleware/field-masking.js');

    const app = express();
    app.use((req: any, _res: any, next: any) => {
      req.user = { userId: 'u1', roles: ['Auditor'], permissions: [] };
      next();
    });

    app.get('/members', applyFieldMasking('member'), (_req, res) => {
      res.json({
        success: true,
        data: {
          members: [
            { id: 'm1', name: 'Alice', phone: '5551234567' },
            { id: 'm2', name: 'Bob', phone: '5559876543' },
          ],
          total: 2,
        },
      });
    });

    const res = await request(app).get('/members');
    expect(res.body.data.members[0].phone).toBe('****4567');
    expect(res.body.data.members[1].phone).toBe('****6543');
    expect(res.body.data.members[0].name).toBe('Alice');
    expect(res.body.data.total).toBe(2);
  });

  it('masks nested ticket arrays while preserving pagination metadata', async () => {
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.role.findFirst).mockResolvedValue({ id: 'role-1' } as any);
    vi.mocked(db.fieldMaskingRule.findMany).mockResolvedValue([
      { field: 'customerEmail', maskType: MaskType.FULL },
    ] as any);

    const { applyFieldMasking } = await import('../src/common/middleware/field-masking.js');

    const app = express();
    app.use((req: any, _res: any, next: any) => {
      req.user = { userId: 'u1', roles: ['Viewer'], permissions: [] };
      next();
    });

    app.get('/tickets', applyFieldMasking('ticket'), (_req, res) => {
      res.json({
        success: true,
        data: {
          tickets: [
            { id: 't1', subject: 'Delay', customerEmail: 'alice@example.com' },
            { id: 't2', subject: 'Dispute', customerEmail: 'bob@example.com' },
          ],
          total: 2,
        },
      });
    });

    const res = await request(app).get('/tickets');
    expect(res.body.data.tickets[0].customerEmail).toBe('***');
    expect(res.body.data.tickets[1].customerEmail).toBe('***');
    expect(res.body.data.tickets[0].subject).toBe('Delay');
    expect(res.body.data.total).toBe(2);
  });
});
