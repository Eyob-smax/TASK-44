/**
 * DB-backed integration tests — Alert threshold tenant isolation
 *
 * Verifies that alert threshold list/update/delete paths enforce org ownership
 * against a real MySQL database (H-03 threshold scoping fix).
 * No mocking — Prisma client and repository functions used directly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/app/container.js';
import * as repo from '../../src/modules/observability/repository.js';

const RUN_ID = `thr-test-${Date.now()}`;
const ORG_A = `thr-org-a-${RUN_ID}`;
const ORG_B = `thr-org-b-${RUN_ID}`;

let thresholdOrgA: string;
let thresholdOrgB: string;
let thresholdPlatform: string;

describe('Alert threshold — org-scoped list/update/delete (DB-backed)', () => {
  beforeAll(async () => {
    // Create thresholds directly — no FK dependencies on AlertThreshold
    const a = await db.alertThreshold.create({
      data: { metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 80, orgId: ORG_A },
    });
    const b = await db.alertThreshold.create({
      data: { metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 85, orgId: ORG_B },
    });
    const p = await db.alertThreshold.create({
      data: { metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 90, orgId: null },
    });
    thresholdOrgA = a.id;
    thresholdOrgB = b.id;
    thresholdPlatform = p.id;
  });

  afterAll(async () => {
    await db.alertThreshold.deleteMany({
      where: { id: { in: [thresholdOrgA, thresholdOrgB, thresholdPlatform] } },
    });
  });

  it('listAlertThresholds with orgId=ORG_A returns only org-a threshold', async () => {
    const thresholds = await repo.listAlertThresholds(ORG_A);
    const ids = thresholds.map((t) => t.id);
    expect(ids).toContain(thresholdOrgA);
    expect(ids).not.toContain(thresholdOrgB);
    expect(ids).not.toContain(thresholdPlatform);
  });

  it('listAlertThresholds with no orgId returns all thresholds (platform admin)', async () => {
    const thresholds = await repo.listAlertThresholds();
    const ids = thresholds.map((t) => t.id);
    expect(ids).toContain(thresholdOrgA);
    expect(ids).toContain(thresholdOrgB);
    expect(ids).toContain(thresholdPlatform);
  });

  it('updateAlertThreshold rejects cross-org update with NotFoundError', async () => {
    await expect(
      repo.updateAlertThreshold(thresholdOrgB, { isActive: false }, ORG_A),
    ).rejects.toThrow('not found');
  });

  it('updateAlertThreshold succeeds when orgId matches', async () => {
    const updated = await repo.updateAlertThreshold(
      thresholdOrgA,
      { thresholdValue: 82 },
      ORG_A,
    );
    expect(updated.thresholdValue).toBe(82);
  });

  it('deleteAlertThreshold rejects cross-org delete with NotFoundError', async () => {
    await expect(
      repo.deleteAlertThreshold(thresholdOrgB, ORG_A),
    ).rejects.toThrow('not found');
  });

  it('platform-wide threshold update succeeds for any org caller', async () => {
    // orgId = null on threshold → no ownership restriction
    const updated = await repo.updateAlertThreshold(
      thresholdPlatform,
      { thresholdValue: 91 },
      ORG_A,
    );
    expect(updated.thresholdValue).toBe(91);
  });
});
