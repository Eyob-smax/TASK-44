import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../../src/app/container.js';
import { afterSalesOrgRouter, afterSalesTicketRouter } from '../../src/modules/after-sales/routes.js';
import { errorHandler } from '../../src/common/middleware/error-handler.js';

const RUN_ID = `after-sales-write-int-${Date.now()}`;
const jwtSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-after-sales-write-int';

let orgId = '';
let userId = '';
let ticketId = '';
let suggestionId = '';
let fileAssetId = '';
let policyId = '';
let assigneeUserId = '';
let adminRoleId = '';
let createdAdminRole = false;

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId,
      username: `after-sales-user-${RUN_ID}`,
      roles: ['Administrator', 'OpsManager', 'CustomerServiceAgent'],
      permissions: ['read:after-sales:*', 'write:after-sales:*'],
      orgId,
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
  app.use('/api/tickets', afterSalesTicketRouter);
  app.use(errorHandler);
  return app;
}

describe('No-mock HTTP integration: after-sales write handler reach', () => {
  beforeAll(async () => {
    const org = await db.organization.create({
      data: {
        name: `AfterSales Write Org ${RUN_ID}`,
        type: 'district',
        timezone: 'UTC',
      },
    });
    orgId = org.id;

    const user = await db.user.create({
      data: {
        username: `after-sales-write-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'After-sales Write Integration User',
        isActive: true,
        orgId,
      },
    });
    userId = user.id;

    const existingAdminRole = await db.role.findUnique({ where: { name: 'Administrator' } });
    if (existingAdminRole) {
      adminRoleId = existingAdminRole.id;
    } else {
      const createdRole = await db.role.create({
        data: {
          name: 'Administrator',
          description: 'Integration administrator role for after-sales write test',
          isSystem: false,
        },
      });
      adminRoleId = createdRole.id;
      createdAdminRole = true;
    }

    const assignee = await db.user.create({
      data: {
        username: `after-sales-assignee-${RUN_ID}`,
        passwordHash: 'hash',
        salt: 'salt',
        displayName: 'After-sales Assignee',
        isActive: true,
        orgId,
      },
    });
    assigneeUserId = assignee.id;
    await db.userRole.create({ data: { userId: assigneeUserId, roleId: adminRoleId } });

    const policy = await db.compensationPolicy.create({
      data: {
        orgId,
        triggerType: 'delivery_late_48h',
        compensationAmount: 12.5,
        maxCapPerTicket: 50,
        isActive: true,
      },
    });
    policyId = policy.id;

    const asset = await db.fileAsset.create({
      data: {
        originalName: `evidence-${RUN_ID}.jpg`,
        storagePath: `/tmp/evidence-${RUN_ID}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 128,
        uploadedByUserId: userId,
      },
    });
    fileAssetId = asset.id;
  });

  afterAll(async () => {
    if (assigneeUserId) {
      await db.userRole.deleteMany({ where: { userId: assigneeUserId } });
      await db.user.deleteMany({ where: { id: assigneeUserId } });
    }
    await db.compensationApproval.deleteMany({ where: { suggestionId } });
    await db.compensationSuggestion.deleteMany({ where: { id: suggestionId } });
    await db.evidenceAsset.deleteMany({ where: { ticketId } });
    await db.ticketTimeline.deleteMany({ where: { ticketId } });
    if (ticketId) await db.afterSalesTicket.deleteMany({ where: { id: ticketId } });
    if (policyId) await db.compensationPolicy.deleteMany({ where: { id: policyId } });
    if (fileAssetId) {
      await db.perceptualHash.deleteMany({ where: { fileAssetId } });
      await db.fileAsset.deleteMany({ where: { id: fileAssetId } });
    }
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
    if (createdAdminRole) {
      await db.role.deleteMany({ where: { id: adminRoleId } });
    }
  });

  it('covers org-scoped create/list ticket handlers', async () => {
    const app = buildApp();

    const createRes = await request(app)
      .post(`/api/orgs/${orgId}/tickets`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `as-ticket-${RUN_ID}`)
      .send({
        type: 'delay',
        priority: 'medium',
        description: `Delay ticket ${RUN_ID}`,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    ticketId = createRes.body.data.id as string;
    const persistedTicket = await db.afterSalesTicket.findUnique({ where: { id: ticketId } });
    expect(persistedTicket?.status).toBe('open');
    expect(persistedTicket?.orgId).toBe(orgId);

    const listRes = await request(app)
      .get(`/api/orgs/${orgId}/tickets?status=open&page=1&limit=25`)
      .set('Authorization', authHeader());

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data.tickets)).toBe(true);
    expect(listRes.body.data.tickets.some((t: { id: string }) => t.id === ticketId)).toBe(true);
  });

  it('covers ticket-scoped handlers (get/timeline/status/assign/evidence/suggest/approve)', async () => {
    const app = buildApp();

    const getRes = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', authHeader());
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(ticketId);

    const timelineRes = await request(app)
      .post(`/api/tickets/${ticketId}/timeline`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `as-timeline-${RUN_ID}`)
      .send({ content: 'Investigating root cause' });
    expect(timelineRes.status).toBe(201);
    const timelineNote = await db.ticketTimeline.findFirst({
      where: { ticketId, content: 'Investigating root cause' },
      orderBy: { createdAt: 'desc' },
    });
    expect(timelineNote).toBeTruthy();

    const statusRes = await request(app)
      .post(`/api/tickets/${ticketId}/status`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `as-status-${RUN_ID}`)
      .send({ status: 'investigating' });
    expect(statusRes.status).toBe(200);
    const ticketAfterStatus = await db.afterSalesTicket.findUnique({ where: { id: ticketId } });
    expect(ticketAfterStatus?.status).toBe('investigating');

    const assignRes = await request(app)
      .post(`/api/tickets/${ticketId}/assign`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `as-assign-${RUN_ID}`)
      .send({ assignedToUserId: assigneeUserId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.success).toBe(true);
    const ticketAfterAssign = await db.afterSalesTicket.findUnique({ where: { id: ticketId } });
    expect(ticketAfterAssign?.assignedToUserId).toBe(assigneeUserId);
    expect(ticketAfterAssign?.status).toBe('investigating');

    const evidenceRes = await request(app)
      .post(`/api/tickets/${ticketId}/evidence`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `as-evidence-${RUN_ID}`)
      .send({ fileAssetId, description: 'Evidence attached in integration test' });
    expect(evidenceRes.status).toBe(201);
    const evidence = await db.evidenceAsset.findFirst({
      where: { ticketId, fileAssetId },
      orderBy: { uploadedAt: 'desc' },
    });
    expect(evidence?.description).toContain('integration test');

    const suggestRes = await request(app)
      .post(`/api/tickets/${ticketId}/suggest-compensation`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `as-suggest-${RUN_ID}`)
      .send({});

    expect(suggestRes.status).toBe(201);
    expect(suggestRes.body.success).toBe(true);
    suggestionId = suggestRes.body.data.id as string;
    const suggestion = await db.compensationSuggestion.findUnique({ where: { id: suggestionId } });
    expect(suggestion?.status).toBe('pending');

    const approveRes = await request(app)
      .post(`/api/tickets/${ticketId}/compensations/${suggestionId}/approve`)
      .set('Authorization', authHeader())
      .set('X-Idempotency-Key', `as-approve-${RUN_ID}`)
      .send({ decision: 'approved', notes: 'Approved by integration test' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    const approval = await db.compensationApproval.findUnique({ where: { suggestionId } });
    expect(approval?.decision).toBe('approved');
    const approvedSuggestion = await db.compensationSuggestion.findUnique({ where: { id: suggestionId } });
    expect(approvedSuggestion?.status).toBe('approved');
  });
});
