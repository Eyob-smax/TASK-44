import { Request, Response, NextFunction } from 'express';
import { NotFoundError, ForbiddenError, UnprocessableError } from '../../common/errors/app-errors.js';
import { db } from '../../app/container.js';
import * as service from './service.js';
import * as repo from './repository.js';

export async function createTicketHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ticket = await service.createTicket(req.params.orgId, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: ticket });
  } catch (err) { next(err); }
}

export async function listTicketsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query['page']) || 1;
    const limit = Number(req.query['limit']) || 25;
    const { type, status, priority, assignedToUserId } = req.query as Record<string, string>;
    const { tickets, total } = await repo.listTickets(
      req.params.orgId,
      { type, status, priority, assignedToUserId },
      { page, limit },
    );
    res.json({ success: true, data: { tickets, total } });
  } catch (err) { next(err); }
}

export async function getTicketHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ticket = await repo.findTicketById(req.params.id);
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (req.user!.orgId && ticket.orgId !== req.user!.orgId) throw new NotFoundError('Ticket not found');
    res.json({ success: true, data: ticket });
  } catch (err) { next(err); }
}

export async function addTimelineEntryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = req.body as { content: string };
    const ticket = await repo.findTicketById(req.params.id);
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (req.user!.orgId && ticket.orgId !== req.user!.orgId) throw new NotFoundError('Ticket not found');
    const entry = await repo.addTimelineEntry(req.params.id, req.user!.userId, 'note', content);
    res.status(201).json({ success: true, data: entry });
  } catch (err) { next(err); }
}

export async function addEvidenceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { fileAssetId, description } = req.body as { fileAssetId: string; description?: string };

    // Verify ticket exists and caller's org matches
    const ticket = await repo.findTicketById(req.params.id);
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (req.user!.orgId && ticket.orgId !== req.user!.orgId) throw new NotFoundError('Ticket not found');

    // Verify file asset exists and belongs to the same org
    const asset = await db.fileAsset.findUnique({
      where: { id: fileAssetId },
      include: { uploadedBy: { select: { orgId: true } } },
    });
    if (!asset) throw new NotFoundError('File asset not found');
    if (asset.uploadedBy.orgId && asset.uploadedBy.orgId !== ticket.orgId) {
      throw new ForbiddenError('File asset does not belong to this organization');
    }

    const evidence = await service.addEvidence(req.params.id, fileAssetId, req.user!.userId, description);
    res.status(201).json({ success: true, data: evidence });
  } catch (err) { next(err); }
}

export async function suggestCompensationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ticket = await repo.findTicketById(req.params.id);
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (req.user!.orgId && ticket.orgId !== req.user!.orgId) throw new NotFoundError('Ticket not found');
    const suggestion = await service.suggestCompensation(req.params.id, ticket.orgId, req.user!.userId);
    res.status(201).json({ success: true, data: suggestion });
  } catch (err) { next(err); }
}

export async function assignTicketHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await repo.findTicketById(req.params.id);
    if (!existing) throw new NotFoundError('Ticket not found');
    if (req.user!.orgId && existing.orgId !== req.user!.orgId) throw new NotFoundError('Ticket not found');
    const { assignedToUserId } = req.body as { assignedToUserId: string };

    const assignee = await db.user.findUnique({
      where: { id: assignedToUserId },
      include: {
        userRoles: {
          include: {
            role: { select: { name: true } },
          },
        },
      },
    });

    if (!assignee || !assignee.isActive) {
      throw new NotFoundError('Assignee not found');
    }
    if (assignee.orgId !== existing.orgId) {
      throw new NotFoundError('Assignee not found');
    }

    const canHandleAfterSales = assignee.userRoles.some((ur) =>
      ['CustomerServiceAgent', 'OpsManager', 'Administrator'].includes(ur.role.name),
    );
    if (!canHandleAfterSales) {
      throw new UnprocessableError('Assignee must have an after-sales eligible role');
    }

    const ticket = await repo.assignTicket(req.params.id, assignedToUserId, req.user!.userId);
    res.json({ success: true, data: ticket });
  } catch (err) { next(err); }
}

export async function updateTicketStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await repo.findTicketById(req.params.id);
    if (!existing) throw new NotFoundError('Ticket not found');
    if (req.user!.orgId && existing.orgId !== req.user!.orgId) throw new NotFoundError('Ticket not found');
    const { status } = req.body as { status: string };
    const resolvedAt = status === 'resolved' ? new Date() : undefined;
    const ticket = await repo.updateTicketStatus(req.params.id, status, resolvedAt);
    res.json({ success: true, data: ticket });
  } catch (err) { next(err); }
}

export async function approveCompensationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // Org ownership check before mutating
    const suggestion = await repo.findSuggestionById(req.params.suggestionId);
    if (!suggestion) throw new NotFoundError('Compensation suggestion not found');
    const ticket = await repo.findTicketById(suggestion.ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (req.user!.orgId && ticket.orgId !== req.user!.orgId) {
      throw new NotFoundError('Compensation suggestion not found');
    }
    const { decision, notes } = req.body as { decision: string; notes?: string };
    const approval = await service.approveCompensation(
      req.params.suggestionId,
      req.user!.userId,
      decision,
      notes,
    );
    res.json({ success: true, data: approval });
  } catch (err) { next(err); }
}
