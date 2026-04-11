import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ValidationError } from '../../common/errors/app-errors.js';
import * as authService from './service.js';
import * as authRepo from './repository.js';

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = req.body as { username: string; password: string };
    const ipAddress = req.ip ?? '0.0.0.0';
    const session = await authService.login(username, password, ipAddress);
    res.status(200).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user) {
      await authRepo.recordSecurityEvent({
        eventType: 'logout',
        userId: req.user.userId,
        details: { username: req.user.username },
        ipAddress: req.ip ?? '0.0.0.0',
      });
    }
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function getMeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await authRepo.findUserById(req.user!.userId);
    if (!user) { next(new UnauthorizedError('User not found')); return; }
    res.status(200).json({
      success: true,
      data: {
        user: authService.toUserResponse(user),
        permissions: authService.decodePermissions(user),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username, password, displayName, roleIds, orgId } = req.body as {
      username: string;
      password: string;
      displayName: string;
      roleIds: string[];
      orgId?: string;
    };

    const roles = await authRepo.findRolesByIds(roleIds);
    if (roles.length !== roleIds.length) {
      throw new ValidationError('One or more role IDs are invalid', {
        roleIds: ['One or more role IDs are invalid'],
      });
    }

    const assignsNonAdminRole = roles.some((r) => r.name !== 'Administrator');
    if (assignsNonAdminRole && !orgId) {
      throw new ValidationError('orgId is required when assigning non-administrator roles', {
        orgId: ['orgId is required when assigning non-administrator roles'],
      });
    }

    const { hash, salt } = await authService.hashPassword(password);
    const user = await authRepo.createUser({
      username,
      passwordHash: hash,
      salt,
      displayName,
      roleIds,
      orgId,
    });

    const userResponse = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      orgId: user.orgId ?? null,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      roles: user.userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
      createdAt: user.createdAt.toISOString(),
    };

    res.status(201).json({ success: true, data: userResponse });
  } catch (err) {
    next(err);
  }
}
