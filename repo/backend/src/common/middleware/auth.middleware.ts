import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../app/config.js';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors/app-errors.js';

interface JwtPayload {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  orgId?: string;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    const isAdministrator = payload.roles.includes('Administrator');
    if (!isAdministrator && !payload.orgId) {
      next(new UnauthorizedError('Organization context required'));
      return;
    }
    req.user = {
      userId: payload.userId,
      username: payload.username,
      roles: payload.roles,
      permissions: payload.permissions,
      orgId: payload.orgId,
    };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requirePermission(action: string, resource: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const hasPermission = req.user.permissions.some((p) => {
      const [pAction, pResource, pScope] = p.split(':');
      const scopeMatch = !pScope || pScope === '*';
      return pAction === action && pResource === resource && scopeMatch;
    });

    if (!hasPermission) {
      next(new ForbiddenError(`Permission denied: ${action}:${resource}`));
      return;
    }
    next();
  };
}

/**
 * Enforces org boundary on routes that include :orgId in their path.
 * When a JWT-authenticated user has an orgId, it must match the route's :orgId param.
 * Users without an orgId (e.g., platform administrators) bypass the check.
 * Apply after `authenticate` on all org-scoped routers.
 */
export function enforceSameOrg(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  const isAdministrator = req.user.roles.includes('Administrator');
  if (!isAdministrator && !req.user.orgId) {
    next(new ForbiddenError('Access denied: missing organization context'));
    return;
  }

  if (!isAdministrator && req.params['orgId'] && req.user.orgId !== req.params['orgId']) {
    // Return not-found to avoid exposing tenant existence details.
    next(new NotFoundError('Resource not found'));
    return;
  }
  next();
}

export function requireRole(...roleNames: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const hasRole = req.user.roles.some((r) => roleNames.includes(r));
    if (!hasRole) {
      next(new ForbiddenError(`Role required: ${roleNames.join(' or ')}`));
      return;
    }
    next();
  };
}
