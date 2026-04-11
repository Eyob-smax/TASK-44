import { Request, Response, NextFunction } from 'express';
import { NotFoundError, UnprocessableError } from '../../common/errors/app-errors.js';
import { db } from '../../app/container.js';
import * as service from './service.js';
import * as repo from './repository.js';

export async function listFacilitiesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const facilities = await repo.listFacilities(req.user!.orgId);
    res.json({ success: true, data: facilities });
  } catch (err) { next(err); }
}

export async function ingestParkingEventHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.ingestParkingEvent(req.body, req.user!.orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getFacilityStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const status = await service.getParkingStatusSummary(req.params.id, req.user!.orgId);
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
}

export async function listExceptionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query['page']) || 1;
    const limit = Number(req.query['limit']) || 25;
    const { facilityId, type, status } = req.query as Record<string, string>;
    const { exceptions, total } = await repo.findExceptions(
      { facilityId, type, status },
      { page, limit },
      req.user!.orgId,
    );
    res.json({ success: true, data: { exceptions, total } });
  } catch (err) { next(err); }
}

export async function getExceptionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ex = await repo.findExceptionById(req.params.id);
    if (!ex) throw new NotFoundError('Parking exception not found');
    if (req.user!.orgId && ex.facility.campus.orgId !== req.user!.orgId) {
      throw new NotFoundError('Parking exception not found');
    }
    res.json({ success: true, data: ex });
  } catch (err) { next(err); }
}

export async function resolveExceptionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ex = await repo.findExceptionById(req.params.id);
    if (!ex) throw new NotFoundError('Parking exception not found');
    if (req.user!.orgId && ex.facility.campus.orgId !== req.user!.orgId) {
      throw new NotFoundError('Parking exception not found');
    }

    const { resolutionNote } = req.body as { resolutionNote: string };
    const result = await repo.resolveException(req.params.id, resolutionNote);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function escalateExceptionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ex = await repo.findExceptionById(req.params.id);
    if (!ex) throw new NotFoundError('Parking exception not found');
    if (req.user!.orgId && ex.facility.campus.orgId !== req.user!.orgId) {
      throw new NotFoundError('Parking exception not found');
    }
    const { escalatedToUserId } = req.body as { escalatedToUserId?: string };
    const targetUserId = escalatedToUserId ?? req.user!.userId;

    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      include: {
        userRoles: {
          include: {
            role: { select: { name: true } },
          },
        },
      },
    });

    if (!targetUser || !targetUser.isActive) {
      throw new NotFoundError('Escalation target not found');
    }
    if (targetUser.orgId !== ex.facility.campus.orgId) {
      throw new NotFoundError('Escalation target not found');
    }

    const canReceiveEscalation = targetUser.userRoles.some((ur) =>
      ['OpsManager', 'Administrator'].includes(ur.role.name),
    );
    if (!canReceiveEscalation) {
      throw new UnprocessableError('Escalation target must have supervisor privileges');
    }

    const escalation = await repo.escalateException(req.params.id, targetUserId);
    res.json({ success: true, data: escalation });
  } catch (err) { next(err); }
}
