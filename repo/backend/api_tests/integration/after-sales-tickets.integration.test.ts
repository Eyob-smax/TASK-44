import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { afterSalesOrgRouter } from '../../src/modules/after-sales/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `after-sales-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-after-sales-integration';

let orgAId = '';
let orgBId = '';
let userAId = '';
let userBId = '';
let ticketAId = '';
let ticketBId = '';

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: userAId,
      username: 'after-sales-int-user',
      roles: ['OpsManager'],
      permissions: ['read:after-sales:*', 'write:after-sales:*'],
      orgId: orgAId,
      ...overrides,
    },
    jwtSecret,
  );
  return `Bearer ${token}`;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orgs/:orgId', afterSalesOrgRouter);
  app.use(errorHandler);
  return app;
}

describe('DB-backed API integration: after-sales ticket listing', () => {
  beforeAll(async () => {
    const [orgA, orgB] = await Promise.all([
      db.organization.create({
        data: {
          name: `AfterSales Org A ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
      db.organization.create({
        data: {
          name: `AfterSales Org B ${RUN_ID}`,
          type: 'district',
          timezone: 'UTC',
        },
      }),
    ]);

    orgAId = orgA.id;
    orgBId = orgB.id;

    const [userA, userB] = await Promise.all([
      db.user.create({
        data: {
          username: `as-user-a-${RUN_ID}`,
          passwordHash: 'hash',
          salt: 'salt',
          displayName: 'After-sales User A',
          isActive: true,
          orgId: orgAId,
        },
      }),
      db.user.create({
        data: {
          username: `as-user-b-${RUN_ID}`,
          passwordHash: 'hash',
          salt: 'salt',
          displayName: 'After-sales User B',
          isActive: true,
          orgId: orgBId,
        },
      }),
    ]);

    userAId = userA.id;
    userBId = userB.id;

    const [ticketA, ticketB] = await Promise.all([
      db.afterSalesTicket.create({
        data: {
          orgId: orgAId,
          type: 'dispute',
          status: 'open',
          priority: 'medium',
          createdByUserId: userAId,
          slaDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
      db.afterSalesTicket.create({
        data: {
          orgId: orgBId,
          type: 'delay',
          status: 'open',
          priority: 'high',
          createdByUserId: userBId,
          slaDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    ticketAId = ticketA.id;
    ticketBId = ticketB.id;
  });

  afterAll(async () => {
    await db.ticketTimeline.deleteMany({ where: { ticketId: { in: [ticketAId, ticketBId].filter(Boolean) } } });
    await db.evidenceAsset.deleteMany({ where: { ticketId: { in: [ticketAId, ticketBId].filter(Boolean) } } });
    await db.compensationApproval.deleteMany({ where: { suggestion: { ticketId: { in: [ticketAId, ticketBId].filter(Boolean) } } } });
    await db.compensationSuggestion.deleteMany({ where: { ticketId: { in: [ticketAId, ticketBId].filter(Boolean) } } });
    await db.afterSalesTicket.deleteMany({ where: { id: { in: [ticketAId, ticketBId].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId].filter(Boolean) } } });
    await db.organization.deleteMany({ where: { id: { in: [orgAId, orgBId].filter(Boolean) } } });
  });

  it('GET /api/orgs/:orgId/tickets returns only same-org tickets', async () => {
    const app = buildApp();

    const res = await request(app)
      .get(`/api/orgs/${orgAId}/tickets?status=open&page=1&limit=25`)
      .set('Authorization', authHeader({ orgId: orgAId }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.tickets)).toBe(true);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tickets).toHaveLength(1);
    expect(res.body.data.tickets[0].id).toBe(ticketAId);
  });

  it('GET /api/orgs/:orgId/tickets rejects cross-org access with 404', async () => {
    const app = buildApp();

    const res = await request(app)
      .get(`/api/orgs/${orgAId}/tickets`)
      .set('Authorization', authHeader({ orgId: orgBId }));

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('GET /api/orgs/:orgId/tickets enforces read permission', async () => {
    const app = buildApp();

    const res = await request(app)
      .get(`/api/orgs/${orgAId}/tickets`)
      .set(
        'Authorization',
        authHeader({ orgId: orgAId, permissions: ['read:memberships:*'] }),
      );

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});
