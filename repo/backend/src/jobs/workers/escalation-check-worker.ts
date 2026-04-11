import { BaseWorker } from './base-worker.js';
import { db } from '../../app/container.js';
import { logger } from '../../common/logging/logger.js';
import { isEscalationEligible, ParkingExceptionStatus } from '../../modules/parking/types.js';
import { escalateException } from '../../modules/parking/repository.js';
import { checkUnsettledSessions } from '../../modules/parking/service.js';
import { getConfig } from '../../modules/configuration/service.js';

export class EscalationCheckWorker extends BaseWorker {
  readonly type = 'escalation_check';

  async handle(payload: object): Promise<void> {
    const { facilityId } = payload as { facilityId: string };
    const facility = await db.parkingFacility.findUnique({
      where: { id: facilityId },
      include: { campus: { select: { orgId: true } } },
    });
    if (!facility) {
      logger.warn({ facilityId }, 'Parking facility not found — cannot escalate exceptions');
      return;
    }

    const unsettledCreated = await checkUnsettledSessions(facilityId);
    if (unsettledCreated.length > 0) {
      logger.info(
        { facilityId, createdCount: unsettledCreated.length },
        'Generated unsettled exceptions from completed sessions',
      );
    }

    const openExceptions = await db.parkingException.findMany({
      where: { facilityId, status: 'open' },
      orderBy: { createdAt: 'asc' },
    });

    if (openExceptions.length === 0) {
      logger.info({ facilityId }, 'No open exceptions to check for escalation');
      return;
    }

    const escalationThresholdMs = getConfig().config.parkingEscalationMinutes * 60 * 1000;
    const now = new Date();
    const eligible = openExceptions.filter((ex) =>
      isEscalationEligible(
        { status: ex.status as ParkingExceptionStatus, createdAt: ex.createdAt },
        now,
        escalationThresholdMs,
      ),
    );

    if (eligible.length === 0) {
      logger.info({ facilityId, checked: openExceptions.length }, 'No exceptions eligible for escalation');
      return;
    }

    // Find a supervisor (OpsManager role) to escalate to
    const opsManagerRole = await db.role.findFirst({ where: { name: 'OpsManager' } });
    if (!opsManagerRole) {
      logger.warn({ facilityId }, 'OpsManager role not found — cannot escalate exceptions');
      return;
    }

    const supervisorUserRole = await db.userRole.findFirst({
      where: {
        roleId: opsManagerRole.id,
        user: {
          isActive: true,
          orgId: facility.campus.orgId,
        },
      },
    });
    if (!supervisorUserRole) {
      logger.warn({ facilityId, orgId: facility.campus.orgId }, 'No org-scoped OpsManager found — cannot escalate exceptions');
      return;
    }

    let escalatedCount = 0;
    for (const ex of eligible) {
      try {
        await escalateException(ex.id, supervisorUserRole.userId);
        escalatedCount++;
      } catch (err) {
        logger.error({ facilityId, exceptionId: ex.id, err }, 'Failed to escalate exception');
      }
    }

    logger.info({ facilityId, eligible: eligible.length, escalated: escalatedCount }, 'Escalation check completed');
  }
}
