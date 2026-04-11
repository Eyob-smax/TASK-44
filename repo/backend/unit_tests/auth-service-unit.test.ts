import { describe, it, expect, beforeAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
  vi.stubEnv('JWT_SECRET', 'test-jwt-secret-for-unit-tests');
  vi.stubEnv('AES_KEY', 'a'.repeat(64));
  vi.stubEnv('BCRYPT_ROUNDS', '4');
});

const { decodePermissions, buildJwt, hashPassword } = await import('../src/modules/auth/service.js');

function makeUser(overrides = {}) {
  return {
    id: 'user-001',
    username: 'alice',
    displayName: 'Alice',
    passwordHash: '$2b$04$test',
    salt: 'salt',
    isActive: true,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    userRoles: [
      {
        userId: 'user-001',
        roleId: 'role-001',
        role: {
          id: 'role-001',
          name: 'Auditor',
          description: null,
          isSystem: true,
          rolePermissions: [
            {
              roleId: 'role-001',
              permissionId: 'perm-001',
              permission: {
                id: 'perm-001',
                action: 'read',
                resource: 'audit-logs',
                scope: '*',
              },
            },
            {
              roleId: 'role-001',
              permissionId: 'perm-002',
              permission: {
                id: 'perm-002',
                action: 'read',
                resource: 'students',
                scope: '*',
              },
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe('decodePermissions', () => {
  it('flattens role→permission chain into action:resource:scope strings', () => {
    const user = makeUser();
    const perms = decodePermissions(user as Parameters<typeof decodePermissions>[0]);
    expect(perms).toContain('read:audit-logs:*');
    expect(perms).toContain('read:students:*');
    expect(perms).toHaveLength(2);
  });

  it('deduplicates permissions if the same permission appears in multiple roles', () => {
    const user = makeUser({
      userRoles: [
        {
          userId: 'user-001',
          roleId: 'role-001',
          role: {
            id: 'role-001',
            name: 'RoleA',
            description: null,
            isSystem: false,
            rolePermissions: [
              {
                roleId: 'role-001',
                permissionId: 'perm-001',
                permission: { id: 'perm-001', action: 'read', resource: 'students', scope: '*' },
              },
            ],
          },
        },
        {
          userId: 'user-001',
          roleId: 'role-002',
          role: {
            id: 'role-002',
            name: 'RoleB',
            description: null,
            isSystem: false,
            rolePermissions: [
              {
                roleId: 'role-002',
                permissionId: 'perm-001',
                permission: { id: 'perm-001', action: 'read', resource: 'students', scope: '*' },
              },
            ],
          },
        },
      ],
    });
    const perms = decodePermissions(user as Parameters<typeof decodePermissions>[0]);
    expect(perms.filter((p) => p === 'read:students:*')).toHaveLength(1);
  });
});

describe('buildJwt', () => {
  it('produces a string with 3 dot-separated segments', () => {
    const user = makeUser();
    const token = buildJwt(user as Parameters<typeof buildJwt>[0]);
    const segments = token.split('.');
    expect(segments).toHaveLength(3);
  });

  it('JWT payload contains userId, username, roles, permissions', () => {
    const user = makeUser();
    const token = buildJwt(user as Parameters<typeof buildJwt>[0]);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded['userId']).toBe('user-001');
    expect(decoded['username']).toBe('alice');
    expect(decoded['roles']).toContain('Auditor');
    expect(Array.isArray(decoded['permissions'])).toBe(true);
  });
});

describe('hashPassword', () => {
  it('round-trips through bcrypt.compare', async () => {
    const { hash } = await hashPassword('MyTestPassword');
    const valid = await bcrypt.compare('MyTestPassword', hash);
    expect(valid).toBe(true);
  });
});
