import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { requestId } from '../common/middleware/request-id.js';
import { requestAccessLog } from '../common/middleware/request-logging.js';
import { globalRateLimiter } from '../common/middleware/rate-limiter.js';
import { errorHandler } from '../common/middleware/error-handler.js';
import { authRouter, adminRouter } from '../modules/auth/routes.js';
import { masterDataRouter } from '../modules/master-data/routes.js';
import { classroomOpsRouter } from '../modules/classroom-ops/routes.js';
import { parkingRouter } from '../modules/parking/routes.js';
import { logisticsOrgRouter, logisticsShipmentRouter } from '../modules/logistics/routes.js';
import { afterSalesOrgRouter, afterSalesTicketRouter } from '../modules/after-sales/routes.js';
import { membershipsOrgRouter, membershipsRouter } from '../modules/memberships/routes.js';
import { observabilityRouter } from '../modules/observability/routes.js';
import { configRouter } from '../modules/configuration/routes.js';
import { backupsRouter } from '../modules/backups/routes.js';
import { filesRouter } from '../modules/files/routes.js';

export function createApp(): Express {
  const app = express();

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(compression());
  app.use(express.json());
  app.use(globalRateLimiter);
  app.use(requestAccessLog);

  // Auth
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);

  // Master data (org-scoped)
  app.use('/api/orgs', masterDataRouter);

  // Classroom ops
  app.use('/api/classroom-ops', classroomOpsRouter);

  // Parking
  app.use('/api/parking', parkingRouter);

  // Logistics — org-scoped config + standalone shipments
  app.use('/api/orgs/:orgId', logisticsOrgRouter);
  app.use('/api/shipments', logisticsShipmentRouter);

  // After-sales — org-scoped ticket creation/list + standalone ticket operations
  app.use('/api/orgs/:orgId', afterSalesOrgRouter);
  app.use('/api/tickets', afterSalesTicketRouter);

  // Memberships — org-scoped tier/member/coupon/fulfillment + member-scoped wallet
  app.use('/api/orgs/:orgId', membershipsOrgRouter);
  app.use('/api/members', membershipsRouter);

  // Observability (metrics ingestion, logs, alert thresholds, alerts, notifications)
  app.use('/api/observability', observabilityRouter);

  // Runtime configuration (in-memory overlay)
  app.use('/api/config', configRouter);

  // Backup & restore
  app.use('/api/backups', backupsRouter);

  // File asset downloads
  app.use('/api/files', filesRouter);

  app.use(errorHandler);

  return app;
}
