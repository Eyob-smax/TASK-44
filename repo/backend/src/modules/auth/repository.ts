import { db } from '../../app/container.js';
import { encrypt } from '../../common/encryption/aes256.js';

export type UserWithRoles = Awaited<ReturnType<typeof findUserByUsername>> & {};

export async function findUserByUsername(username: string) {
  return db.user.findUnique({
    where: { username },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function findUserById(id: string) {
  return db.user.findUnique({
    where: { id },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function recordLoginAttempt(data: {
  userId?: string;
  username: string;
  success: boolean;
  ipAddress: string;
}): Promise<void> {
  await db.loginAttempt.create({
    data: {
      userId: data.userId ?? null,
      username: data.username,
      success: data.success,
      ipAddress: data.ipAddress,
    },
  });
}

export async function recordSecurityEvent(data: {
  eventType: string;
  userId?: string;
  details: object;
  ipAddress: string;
}): Promise<void> {
  const encryptedDetails = encrypt(JSON.stringify(data.details));
  await db.securityEvent.create({
    data: {
      eventType: data.eventType,
      userId: data.userId ?? null,
      details: encryptedDetails,
      ipAddress: data.ipAddress,
    },
  });
}

export async function updateLoginSuccess(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
}

export async function updateLoginFailure(
  userId: string,
  newCount: number,
  lockedUntil?: Date,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      failedAttempts: newCount,
      ...(lockedUntil ? { lockedUntil } : {}),
    },
  });
}

export async function findFieldMaskingRules(roleId: string, resource: string) {
  return db.fieldMaskingRule.findMany({
    where: { roleId, resource },
  });
}

export async function findRolesByIds(roleIds: string[]) {
  return db.role.findMany({
    where: { id: { in: roleIds } },
    select: { id: true, name: true },
  });
}

export async function createUser(data: {
  username: string;
  passwordHash: string;
  salt: string;
  displayName: string;
  roleIds: string[];
  orgId?: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: data.username,
        passwordHash: data.passwordHash,
        salt: data.salt,
        displayName: data.displayName,
        orgId: data.orgId ?? null,
      },
    });

    await tx.userRole.createMany({
      data: data.roleIds.map((roleId) => ({ userId: user.id, roleId })),
    });

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });
  });
}
