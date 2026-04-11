import { db } from '../../app/container.js';
import { NotFoundError } from '../../common/errors/app-errors.js';
import { TimelineEntryType, type TicketStatus } from './types.js';

// ---- Tickets ----

export async function findShipmentOrgById(id: string) {
  return db.shipment.findUnique({
    where: { id },
    select: {
      id: true,
      warehouse: { select: { orgId: true } },
    },
  });
}

export async function findParcelWithShipmentOrgById(id: string) {
  return db.parcel.findUnique({
    where: { id },
    select: {
      id: true,
      shipmentId: true,
      shipment: {
        select: {
          warehouse: { select: { orgId: true } },
        },
      },
    },
  });
}

export async function createTicket(data: {
  orgId: string;
  createdByUserId: string;
  type: string;
  shipmentId?: string;
  parcelId?: string;
  priority: string;
  slaDeadlineAt: Date;
  description: string;
}) {
  return db.$transaction(async (tx) => {
    const ticket = await tx.afterSalesTicket.create({
      data: {
        orgId: data.orgId,
        type: data.type,
        shipmentId: data.shipmentId ?? null,
        parcelId: data.parcelId ?? null,
        status: 'open',
        priority: data.priority,
        createdByUserId: data.createdByUserId,
        slaDeadlineAt: data.slaDeadlineAt,
      },
    });

    await tx.ticketTimeline.create({
      data: {
        ticketId: ticket.id,
        entryType: TimelineEntryType.CREATED,
        content: data.description,
        userId: data.createdByUserId,
      },
    });

    return ticket;
  });
}

export async function findTicketById(id: string) {
  return db.afterSalesTicket.findUnique({
    where: { id },
    include: {
      timeline: { orderBy: { createdAt: 'asc' } },
      evidence: { include: { fileAsset: true } },
      compensations: { include: { approval: true } },
    },
  });
}

export async function listTickets(
  orgId: string,
  filters: { type?: string; status?: string; priority?: string; assignedToUserId?: string },
  pagination: { page: number; limit: number },
) {
  const where = {
    orgId,
    ...(filters.type && { type: filters.type }),
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.assignedToUserId && { assignedToUserId: filters.assignedToUserId }),
  };

  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    db.afterSalesTicket.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    db.afterSalesTicket.count({ where }),
  ]);

  return { tickets, total };
}

export async function addTimelineEntry(
  ticketId: string,
  userId: string,
  entryType: string,
  content: string,
) {
  return db.ticketTimeline.create({
    data: { ticketId, userId, entryType, content },
  });
}

export async function updateTicketStatus(ticketId: string, status: string, resolvedAt?: Date) {
  return db.$transaction(async (tx) => {
    const ticket = await tx.afterSalesTicket.update({
      where: { id: ticketId },
      data: { status, ...(resolvedAt && { resolvedAt }) },
    });

    await tx.ticketTimeline.create({
      data: {
        ticketId,
        userId: ticket.createdByUserId,
        entryType: TimelineEntryType.STATUS_CHANGE,
        content: `Status changed to ${status}`,
      },
    });

    return ticket;
  });
}

export async function assignTicket(
  ticketId: string,
  assignedToUserId: string,
  assignedByUserId: string,
) {
  return db.$transaction(async (tx) => {
    const ticket = await tx.afterSalesTicket.update({
      where: { id: ticketId },
      data: { assignedToUserId, status: 'investigating' },
    });

    await tx.ticketTimeline.create({
      data: {
        ticketId,
        userId: assignedByUserId,
        entryType: TimelineEntryType.ASSIGNED,
        content: `Ticket assigned to user ${assignedToUserId}`,
      },
    });

    return ticket;
  });
}

// ---- Evidence ----

export async function addEvidence(data: {
  ticketId: string;
  fileAssetId: string;
  uploadedByUserId: string;
  description?: string;
}) {
  return db.$transaction(async (tx) => {
    const evidence = await tx.evidenceAsset.create({
      data: {
        ticketId: data.ticketId,
        fileAssetId: data.fileAssetId,
        uploadedByUserId: data.uploadedByUserId,
        description: data.description ?? null,
      },
    });

    await tx.ticketTimeline.create({
      data: {
        ticketId: data.ticketId,
        userId: data.uploadedByUserId,
        entryType: TimelineEntryType.EVIDENCE_ADDED,
        content: data.description ?? 'Evidence uploaded',
      },
    });

    return evidence;
  });
}

// ---- Compensation ----

export async function findActivePolicies(orgId: string, triggerType: string) {
  return db.compensationPolicy.findMany({
    where: { orgId, triggerType, isActive: true },
  });
}

export async function findApprovedSuggestionsTotal(ticketId: string): Promise<number> {
  const suggestions = await db.compensationSuggestion.findMany({
    where: { ticketId, status: 'approved' },
    select: { suggestedAmount: true },
  });
  return suggestions.reduce((sum, s) => sum + parseFloat(s.suggestedAmount.toString()), 0);
}

export async function createSuggestion(data: {
  ticketId: string;
  policyId: string;
  suggestedAmount: number;
  reason: string;
  createdByUserId: string;
}) {
  return db.$transaction(async (tx) => {
    const suggestion = await tx.compensationSuggestion.create({
      data: {
        ticketId: data.ticketId,
        policyId: data.policyId,
        suggestedAmount: data.suggestedAmount,
        reason: data.reason,
        status: 'pending',
      },
    });

    await tx.afterSalesTicket.update({
      where: { id: data.ticketId },
      data: { status: 'pending_approval' },
    });

    await tx.ticketTimeline.create({
      data: {
        ticketId: data.ticketId,
        userId: data.createdByUserId,
        entryType: TimelineEntryType.COMPENSATION,
        content: `Compensation suggested: $${data.suggestedAmount.toFixed(2)} — ${data.reason}`,
      },
    });

    return suggestion;
  });
}

export async function createApproval(data: {
  suggestionId: string;
  approvedByUserId: string;
  decision: string;
  notes?: string;
}) {
  return db.$transaction(async (tx) => {
    const approval = await tx.compensationApproval.create({
      data: {
        suggestionId: data.suggestionId,
        approvedByUserId: data.approvedByUserId,
        decision: data.decision,
        notes: data.notes ?? null,
      },
    });

    await tx.compensationSuggestion.update({
      where: { id: data.suggestionId },
      data: { status: data.decision },
    });

    return approval;
  });
}

export async function findSuggestionById(id: string) {
  return db.compensationSuggestion.findUnique({
    where: { id },
    include: { approval: true },
  });
}
