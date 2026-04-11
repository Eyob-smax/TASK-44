import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../app/config.js';
import { UnauthorizedError } from '../../common/errors/app-errors.js';
import * as authRepo from './repository.js';
import type { AuthSessionResponse, UserResponse } from './types.js';

type UserWithRoles = NonNullable<Awaited<ReturnType<typeof authRepo.findUserByUsername>>>;

export function decodePermissions(user: UserWithRoles): string[] {
  const permissions: string[] = [];
  for (const userRole of user.userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      const { action, resource, scope } = rp.permission;
      permissions.push(`${action}:${resource}:${scope}`);
    }
  }
  return [...new Set(permissions)];
}

export function buildJwt(user: UserWithRoles): string {
  const roles = user.userRoles.map((ur) => ur.role.name);
  const permissions = decodePermissions(user);

  return jwt.sign(
    { userId: user.id, username: user.username, roles, permissions, orgId: user.orgId ?? undefined },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN } as jwt.SignOptions,
  );
}

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = await bcrypt.genSalt(config.BCRYPT_ROUNDS);
  const hash = await bcrypt.hash(password, salt);
  return { hash, salt };
}

export function toUserResponse(user: UserWithRoles): UserResponse {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    orgId: user.orgId ?? null,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    roles: user.userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
    createdAt: user.createdAt.toISOString(),
  };
}

export async function login(
  username: string,
  password: string,
  ipAddress: string,
): Promise<AuthSessionResponse> {
  const user = await authRepo.findUserByUsername(username);

  // No username enumeration — same message whether user doesn't exist or wrong password
  if (!user) {
    await authRepo.recordLoginAttempt({ username, success: false, ipAddress });
    throw new UnauthorizedError('Invalid credentials');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account disabled');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new UnauthorizedError('Account temporarily locked');
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    const newCount = user.failedAttempts + 1;
    const lockedUntil =
      newCount >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : undefined;

    await authRepo.updateLoginFailure(user.id, newCount, lockedUntil);
    await authRepo.recordLoginAttempt({ userId: user.id, username, success: false, ipAddress });
    await authRepo.recordSecurityEvent({
      eventType: 'login_failed',
      userId: user.id,
      details: { reason: 'invalid_password', failedAttempts: newCount },
      ipAddress,
    });

    throw new UnauthorizedError('Invalid credentials');
  }

  await authRepo.updateLoginSuccess(user.id);
  await authRepo.recordLoginAttempt({ userId: user.id, username, success: true, ipAddress });

  const token = buildJwt(user);
  const permissions = decodePermissions(user);

  return {
    user: toUserResponse(user),
    permissions,
    token,
  };
}
