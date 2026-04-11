/**
 * DB-backed integration tests — Observability tenant isolation
 *
 * These tests run against a real MySQL instance (via DATABASE_URL env var).
 * No mocking: Prisma client is used directly to create and query records.
 *
 * Purpose: verify that org-scoped reads (H-03 fix) correctly filter by orgId
 * and that platform-wide records (orgId = null) remain visible to all.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/app/container.js';
import * as repo from '../../src/modules/observability/repository.js';

const RUN_ID = `int-test-${Date.now()}`;
const ORG_A = `org-a-${RUN_ID}`;
const ORG_B = `org-b-${RUN_ID}`;

describe('Observability — org-scoped log isolation (DB-backed)', () => {
  beforeAll(async () => {
    // Create three logs: one for org-a, one for org-b, one platform-wide (null)
    await db.applicationLog.createMany({
      data: [
        {
          level: 'info',
          message: `[${RUN_ID}] org-a log`,
          messageSearch: `[${RUN_ID}] org-a log`,
          orgId: ORG_A,
        },
        {
          level: 'info',
          message: `[${RUN_ID}] org-b log`,
          messageSearch: `[${RUN_ID}] org-b log`,
          orgId: ORG_B,
        },
        {
          level: 'info',
          message: `[${RUN_ID}] platform log`,
          messageSearch: `[${RUN_ID}] platform log`,
          orgId: null,
        },
      ],
    });
  });

  afterAll(async () => {
    await db.applicationLog.deleteMany({
      where: { message: { contains: RUN_ID } },
    });
  });

  it('returns only org-a logs when orgId filter is org-a', async () => {
    const result = await repo.searchLogs(
      { search: RUN_ID },
      1,
      50,
      ORG_A,
    );
    expect(result.logs.length).toBe(1);
    expect(result.logs[0].orgId).toBe(ORG_A);
  });

  it('returns only org-b logs when orgId filter is org-b', async () => {
    const result = await repo.searchLogs(
      { search: RUN_ID },
      1,
      50,
      ORG_B,
    );
    expect(result.logs.length).toBe(1);
    expect(result.logs[0].orgId).toBe(ORG_B);
  });

  it('returns all three logs when no orgId filter (platform admin path)', async () => {
    const result = await repo.searchLogs(
      { search: RUN_ID },
      1,
      50,
    );
    expect(result.logs.length).toBe(3);
  });

  it('returns zero logs for an orgId with no matching records', async () => {
    const result = await repo.searchLogs(
      { search: RUN_ID },
      1,
      50,
      `no-such-org-${RUN_ID}`,
    );
    expect(result.logs.length).toBe(0);
  });
});
