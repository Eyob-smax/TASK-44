import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterSalesOrgRouter, afterSalesTicketRouter } from '../src/modules/after-sales/routes.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { UnprocessableError } from '../src/common/errors/app-errors.js';

vi.mock('../src/modules/after-sales/service.js', () => ({
  createTicket: vi.fn(),
  addEvidence: vi.fn(),
  suggestCompensation: vi.fn(),
  approveCompensation: vi.fn(),
}));

vi.mock('../src/modules/after-sales/repository.js', () => ({
  createTicket: vi.fn(),
  findTicketById: vi.fn(),
  listTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }),
  addTimelineEntry: vi.fn(),
  updateTicketStatus: vi.fn(),
  assignTicket: vi.fn(),
  addEvidence: vi.fn(),
  findActivePolicies: vi.fn().mockResolvedValue([]),
  findApprovedSuggestionsTotal: vi.fn().mockResolvedValue(0),
  createSuggestion: vi.fn(),
  createApproval: vi.fn(),
  findSuggestionById: vi.fn(),
}));

vi.mock('../src/app/container.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
    fileAsset: {
      findUnique: vi.fn(),
    },
    role: {
      findFirst: vi.fn().mockResolvedValue({ id: 'role-1' }),
    },
    fieldMaskingRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('../src/common/middleware/idempotency.js', () => ({
  idempotency: (_req: any, _res: any, next: any) => next(),
}));

const { createTicket, addEvidence, suggestCompensation, approveCompensation } = await import('../src/modules/after-sales/service.js');
const { findSuggestionById, findTicketById, assignTicket, addTimelineEntry, updateTicketStatus } = await import('../src/modules/after-sales/repository.js');
const { config } = await import('../src/app/config.js');

const jwtSecret = config.JWT_SECRET;

function authHeader(overrides: Partial<{
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId: string;
}> = {}) {
  const token = jwt.sign(
    {
      userId: 'user-1',
      username: 'test',
      roles: ['OpsManager'],
      permissions: ['write:after-sales:*', 'read:after-sales:*'],
      orgId: 'org-1',
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

describe('POST /api/orgs/:orgId/tickets', () => {
  beforeEach(() => vi.clearAllMocks());

  const validBody = {
    type: 'dispute',
    subject: 'Wrong item received',
    description: 'I ordered a blue shirt but received red',
    priority: 'medium',
  };

  it('returns 201 with ticket and initial timeline entry', async () => {
    vi.mocked(createTicket).mockResolvedValue({
      id: 'ticket-1',
      orgId: 'org-1',
      type: 'dispute',
      status: 'open',
      priority: 'medium',
      subject: 'Wrong item received',
      timeline: [{ id: 'tl-1', entryType: 'created', content: 'Ticket opened' }],
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/tickets')
      .set('Authorization', authHeader())
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.timeline).toHaveLength(1);
    expect(res.body.data.timeline[0].entryType).toBe('created');
  });

  it('returns 400 VALIDATION_ERROR when required fields are missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/orgs/org-1/tickets')
      .set('Authorization', authHeader())
      .send({ priority: 'medium' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/tickets/:id/suggest-compensation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 201 and suggestion, ticket moves to pending_approval', async () => {
    vi.mocked(findTicketById).mockResolvedValue({ id: 'ticket-1', orgId: 'org-1' } as any);

    vi.mocked(suggestCompensation).mockResolvedValue({
      id: 'sugg-1',
      ticketId: 'ticket-1',
      policyId: 'policy-1',
      suggestedAmount: 25.0,
      status: 'pending',
      reason: 'Policy: delivery_late_48h',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/suggest-compensation')
      .set('Authorization', authHeader())
      .send({ orgId: 'org-1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.suggestedAmount).toBe(25.0);
  });

  it('returns 201 with null when compensation cap is reached', async () => {
    vi.mocked(findTicketById).mockResolvedValue({ id: 'ticket-1', orgId: 'org-1' } as any);

    vi.mocked(suggestCompensation).mockResolvedValue(null as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/suggest-compensation')
      .set('Authorization', authHeader())
      .send({ orgId: 'org-1' });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeNull();
  });
});

describe('POST /api/tickets/:id/compensations/:suggestionId/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: suggestion and ticket belong to org-1 (same as the caller)
    vi.mocked(findSuggestionById).mockResolvedValue({ id: 'sugg-1', ticketId: 'ticket-1', status: 'pending' } as any);
    vi.mocked(findTicketById).mockResolvedValue({ id: 'ticket-1', orgId: 'org-1' } as any);
  });

  it('returns 200 when OpsManager approves suggestion', async () => {
    vi.mocked(approveCompensation).mockResolvedValue({
      id: 'appr-1',
      suggestionId: 'sugg-1',
      approvedByUserId: 'user-1',
      decision: 'approved',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/compensations/sugg-1/approve')
      .set('Authorization', authHeader())
      .send({ decision: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.decision).toBe('approved');
  });

  it('returns 200 when OpsManager rejects suggestion with notes', async () => {
    vi.mocked(approveCompensation).mockResolvedValue({
      id: 'appr-2',
      suggestionId: 'sugg-1',
      approvedByUserId: 'user-1',
      decision: 'rejected',
      notes: 'Policy does not apply here',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/compensations/sugg-1/approve')
      .set('Authorization', authHeader())
      .send({ decision: 'rejected', notes: 'Policy does not apply here' });

    expect(res.status).toBe(200);
    expect(res.body.data.decision).toBe('rejected');
  });

  it('returns 403 FORBIDDEN when Auditor role attempts to approve', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/compensations/sugg-1/approve')
      .set(
        'Authorization',
        authHeader({ roles: ['Auditor'], permissions: ['read:after-sales:*'] }),
      )
      .send({ decision: 'approved' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when suggestion belongs to a different org (IDOR prevention)', async () => {
    // Suggestion ticket belongs to org-2, but caller is in org-1
    vi.mocked(findTicketById).mockResolvedValue({ id: 'ticket-1', orgId: 'org-2' } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/compensations/sugg-1/approve')
      .set('Authorization', authHeader({ orgId: 'org-1' }))
      .send({ decision: 'approved' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 422 UNPROCESSABLE when suggestion is already processed', async () => {
    vi.mocked(approveCompensation).mockRejectedValue(
      new UnprocessableError("Suggestion is already 'approved'"),
    );

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/compensations/sugg-1/approve')
      .set('Authorization', authHeader())
      .send({ decision: 'approved' });

    expect(res.status).toBe(422);
  });
});

describe('POST /api/tickets/:id/assign', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(findTicketById).mockResolvedValue({ id: 'ticket-1', orgId: 'org-1' } as any);
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000002',
      orgId: 'org-1',
      isActive: true,
      userRoles: [{ role: { name: 'CustomerServiceAgent' } }],
    } as any);
  });

  it('returns 200 when assignee is active, same-org, and role-eligible', async () => {
    vi.mocked(assignTicket).mockResolvedValue({
      id: 'ticket-1',
      assignedToUserId: '00000000-0000-0000-0000-000000000002',
      status: 'investigating',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/assign')
      .set('Authorization', authHeader())
      .send({ assignedToUserId: '00000000-0000-0000-0000-000000000002' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when assignee belongs to another org', async () => {
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000003',
      orgId: 'org-2',
      isActive: true,
      userRoles: [{ role: { name: 'CustomerServiceAgent' } }],
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/assign')
      .set('Authorization', authHeader({ orgId: 'org-1' }))
      .send({ assignedToUserId: '00000000-0000-0000-0000-000000000003' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when assignedToUserId is invalid', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/assign')
      .set('Authorization', authHeader())
      .send({ assignedToUserId: 'user-2' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/tickets/:id/evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: ticket belongs to org-1
    vi.mocked(findTicketById).mockResolvedValue({ id: 'ticket-1', orgId: 'org-1' } as any);
  });

  it('returns 201 and adds evidence_added timeline entry', async () => {
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.fileAsset.findUnique).mockResolvedValue({
      id: 'asset-1',
      uploadedBy: { orgId: 'org-1' },
    } as any);
    vi.mocked(addEvidence).mockResolvedValue({
      id: 'ev-1',
      ticketId: 'ticket-1',
      fileAssetId: 'asset-1',
      uploadedByUserId: 'user-1',
      timelineEntry: { id: 'tl-2', entryType: 'evidence_added', content: 'Evidence file uploaded' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/evidence')
      .set('Authorization', authHeader())
      .send({ fileAssetId: 'asset-1', description: 'Photo of wrong item' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.timelineEntry.entryType).toBe('evidence_added');
  });

  it('returns 403 when fileAsset belongs to a different org', async () => {
    const { db } = await import('../src/app/container.js');
    vi.mocked(db.fileAsset.findUnique).mockResolvedValue({
      id: 'asset-foreign',
      uploadedBy: { orgId: 'org-2' },
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/evidence')
      .set('Authorization', authHeader({ orgId: 'org-1' }))
      .send({ fileAssetId: 'asset-foreign', description: 'test' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/tickets/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with ticket payload when ticket belongs to caller org', async () => {
    vi.mocked(findTicketById).mockResolvedValue({
      id: 'ticket-1',
      orgId: 'org-1',
      type: 'dispute',
      status: 'open',
      priority: 'medium',
      description: 'Wrong item',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .get('/api/tickets/ticket-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('ticket-1');
  });
});

describe('POST /api/tickets/:id/timeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 201 and creates a note timeline entry', async () => {
    vi.mocked(findTicketById).mockResolvedValue({ id: 'ticket-1', orgId: 'org-1' } as any);
    vi.mocked(addTimelineEntry).mockResolvedValue({
      id: 'tl-1',
      ticketId: 'ticket-1',
      entryType: 'note',
      content: 'Customer called support',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/timeline')
      .set('Authorization', authHeader())
      .send({ content: 'Customer called support' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.entryType).toBe('note');
  });
});

describe('POST /api/tickets/:id/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 and updates ticket status', async () => {
    vi.mocked(findTicketById).mockResolvedValue({ id: 'ticket-1', orgId: 'org-1', status: 'open' } as any);
    vi.mocked(updateTicketStatus).mockResolvedValue({
      id: 'ticket-1',
      orgId: 'org-1',
      status: 'resolved',
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post('/api/tickets/ticket-1/status')
      .set('Authorization', authHeader())
      .send({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('resolved');
  });
});
