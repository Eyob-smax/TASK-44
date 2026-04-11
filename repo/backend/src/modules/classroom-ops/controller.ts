import { Request, Response, NextFunction } from 'express';
import * as service from './service.js';
import * as repo from './repository.js';
import { NotFoundError, ValidationError, UnprocessableError } from '../../common/errors/app-errors.js';
import { db } from '../../app/container.js';
import type { AnomalyType, AnomalySeverity } from './types.js';

export async function ingestHeartbeatHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { classroomId, metadata } = req.body as { classroomId: string; metadata?: Record<string, unknown> };
    if (req.user!.orgId) {
      const classroom = await repo.findClassroomById(classroomId);
      if (!classroom || classroom.campus.orgId !== req.user!.orgId) {
        throw new NotFoundError('Classroom not found');
      }
    }
    const heartbeat = await service.ingestHeartbeat(classroomId, metadata);
    res.json({ success: true, data: heartbeat });
  } catch (err) { next(err); }
}

export async function ingestConfidenceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { classroomId, confidence } = req.body as { classroomId: string; confidence: number };
    if (req.user!.orgId) {
      const classroom = await repo.findClassroomById(classroomId);
      if (!classroom || classroom.campus.orgId !== req.user!.orgId) {
        throw new NotFoundError('Classroom not found');
      }
    }
    await service.ingestConfidence(classroomId, confidence);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
}

export async function reportAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { classroomId, type, severity, description } = req.body as {
      classroomId: string;
      type: AnomalyType;
      severity: AnomalySeverity;
      description?: string;
    };
    if (req.user!.orgId) {
      const classroom = await repo.findClassroomById(classroomId);
      if (!classroom || classroom.campus.orgId !== req.user!.orgId) {
        throw new NotFoundError('Classroom not found');
      }
    }
    const anomaly = await repo.createAnomalyEvent({ classroomId, type, severity, description });
    res.status(201).json({ success: true, data: anomaly });
  } catch (err) { next(err); }
}

export async function listAnomaliesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query['page']) || 1;
    const limit = Number(req.query['limit']) || 25;
    const { classroomId, status, severity } = req.query as Record<string, string>;
    const { events, total } = await repo.listAnomalies(
      { classroomId, status, severity },
      { page, limit },
      req.user!.orgId,
    );
    res.json({ success: true, data: { anomalies: events, total } });
  } catch (err) { next(err); }
}

export async function getAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const anomaly = await repo.findAnomalyById(req.params.id);
    if (!anomaly) throw new NotFoundError('Anomaly event not found');
    if (req.user!.orgId && anomaly.classroom.campus.orgId !== req.user!.orgId) {
      throw new NotFoundError('Anomaly event not found');
    }
    res.json({ success: true, data: anomaly });
  } catch (err) { next(err); }
}

export async function acknowledgeAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user!.orgId) {
      const anomaly = await repo.findAnomalyById(req.params.id);
      if (!anomaly || anomaly.classroom.campus.orgId !== req.user!.orgId) {
        throw new NotFoundError('Anomaly event not found');
      }
    }
    const result = await service.acknowledgeAnomaly(req.params.id, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function assignAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { assignedToUserId } = req.body as { assignedToUserId: string };
    const anomaly = await repo.findAnomalyById(req.params.id);
    if (!anomaly) {
      throw new NotFoundError('Anomaly event not found');
    }
    if (req.user!.orgId && anomaly.classroom.campus.orgId !== req.user!.orgId) {
      throw new NotFoundError('Anomaly event not found');
    }

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
    if (assignee.orgId !== anomaly.classroom.campus.orgId) {
      throw new NotFoundError('Assignee not found');
    }

    const canHandleClassroomOps = assignee.userRoles.some((ur) =>
      ['ClassroomSupervisor', 'OpsManager', 'Administrator'].includes(ur.role.name),
    );
    if (!canHandleClassroomOps) {
      throw new UnprocessableError('Assignee must have a classroom-ops eligible role');
    }

    const result = await service.assignAnomaly(req.params.id, assignedToUserId, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function resolveAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { resolutionNote } = req.body as { resolutionNote: string };
    if (req.user!.orgId) {
      const anomaly = await repo.findAnomalyById(req.params.id);
      if (!anomaly || anomaly.classroom.campus.orgId !== req.user!.orgId) {
        throw new NotFoundError('Anomaly event not found');
      }
    }
    const result = await service.resolveAnomaly(req.params.id, req.user!.userId, resolutionNote);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getDashboardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { campusId } = req.query as { campusId: string };
    if (!campusId) {
      throw new ValidationError('campusId query parameter is required', {
        campusId: ['campusId query parameter is required'],
      });
    }

    const campus = await repo.findCampusById(campusId);
    if (!campus) throw new NotFoundError('Campus not found');
    if (req.user!.orgId && campus.orgId !== req.user!.orgId) {
      throw new NotFoundError('Campus not found');
    }

    const data = await service.getClassroomDashboard(campusId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
