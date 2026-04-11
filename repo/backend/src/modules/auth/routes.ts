import { Router } from 'express';
import { loginRateLimiter } from '../../common/middleware/rate-limiter.js';
import { validateBody } from '../../common/middleware/validate.js';
import { authenticate, requireRole } from '../../common/middleware/auth.middleware.js';
import { idempotency } from '../../common/middleware/idempotency.js';
import { loginSchema, createUserSchema } from './schemas.js';
import {
  loginHandler,
  logoutHandler,
  getMeHandler,
  createUserHandler,
} from './controller.js';

export const authRouter = Router();
export const adminRouter = Router();

authRouter.post('/login', loginRateLimiter, idempotency, validateBody(loginSchema), loginHandler);
authRouter.post('/logout', authenticate, logoutHandler);
authRouter.get('/me', authenticate, getMeHandler);

adminRouter.post(
  '/users',
  authenticate,
  requireRole('Administrator'),
  idempotency,
  validateBody(createUserSchema),
  createUserHandler,
);
