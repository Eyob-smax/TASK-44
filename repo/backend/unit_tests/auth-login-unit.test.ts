import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-for-unit-tests');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'integration-signing-secret-for-unit-tests');
vi.stubEnv('BCRYPT_ROUNDS', '4');

const mockAuthRepo = {
  findUserByUsername: vi.fn(),
  recordLoginAttempt: vi.fn(),
  updateLoginFailure: vi.fn(),
  updateLoginSuccess: vi.fn(),
  recordSecurityEvent: vi.fn(),
};

vi.mock('../src/modules/auth/repository.js', () => mockAuthRepo);
vi.mock('../src/app/container.js', () => ({ db: {} }));

const { login } = await import('../src/modules/auth/service.js');

const IP = '10.0.0.1';

function makeActiveUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-001',
    username: 'alice',
    displayName: 'Alice',
    passwordHash: '$2b$04$test',
    salt: 'salt',
    orgId: 'org-1',
    isActive: true,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
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
              permission: { id: 'perm-001', action: 'read', resource: 'audit-logs', scope: '*' },
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('login', () => {
  it('throws UnauthorizedError and records failed attempt when user does not exist (no enumeration)', async () => {
    mockAuthRepo.findUserByUsername.mockResolvedValue(null);

    await expect(login('ghost', 'password', IP)).rejects.toThrow(/Invalid credentials/);
    expect(mockAuthRepo.recordLoginAttempt).toHaveBeenCalledWith({
      username: 'ghost',
      success: false,
      ipAddress: IP,
    });
    expect(mockAuthRepo.updateLoginFailure).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError "Account disabled" when user.isActive is false', async () => {
    mockAuthRepo.findUserByUsername.mockResolvedValue(makeActiveUser({ isActive: false }));

    await expect(login('alice', 'password', IP)).rejects.toThrow(/Account disabled/);
    // Note: no recordLoginAttempt call for disabled (matches current behavior)
  });

  it('throws UnauthorizedError "temporarily locked" when lockedUntil is in the future', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    mockAuthRepo.findUserByUsername.mockResolvedValue(
      makeActiveUser({ lockedUntil: future }),
    );

    await expect(login('alice', 'password', IP)).rejects.toThrow(/temporarily locked/);
  });

  it('increments failedAttempts without locking when wrong password and failedAttempts < 4', async () => {
    const hash = await bcrypt.hash('RealPass', 4);
    mockAuthRepo.findUserByUsername.mockResolvedValue(
      makeActiveUser({ passwordHash: hash, failedAttempts: 2 }),
    );

    await expect(login('alice', 'WrongPass', IP)).rejects.toThrow(/Invalid credentials/);
    expect(mockAuthRepo.updateLoginFailure).toHaveBeenCalledWith('user-001', 3, undefined);
    expect(mockAuthRepo.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'login_failed', userId: 'user-001' }),
    );
  });

  it('sets lockedUntil on the 5th failed attempt (30 min lockout)', async () => {
    const hash = await bcrypt.hash('RealPass', 4);
    mockAuthRepo.findUserByUsername.mockResolvedValue(
      makeActiveUser({ passwordHash: hash, failedAttempts: 4 }), // +1 → 5 triggers lock
    );

    await expect(login('alice', 'WrongPass', IP)).rejects.toThrow(/Invalid credentials/);
    const call = mockAuthRepo.updateLoginFailure.mock.calls[0];
    expect(call[0]).toBe('user-001');
    expect(call[1]).toBe(5);
    const lockedUntil = call[2] as Date;
    expect(lockedUntil).toBeInstanceOf(Date);
    // ~30 minutes in the future
    const deltaMs = lockedUntil.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(29 * 60 * 1000);
    expect(deltaMs).toBeLessThan(31 * 60 * 1000);
  });

  it('returns user, permissions, and token on successful authentication', async () => {
    const hash = await bcrypt.hash('RealPass', 4);
    mockAuthRepo.findUserByUsername.mockResolvedValue(
      makeActiveUser({ passwordHash: hash }),
    );

    const result = await login('alice', 'RealPass', IP);
    expect(mockAuthRepo.updateLoginSuccess).toHaveBeenCalledWith('user-001');
    expect(mockAuthRepo.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-001', username: 'alice', success: true, ipAddress: IP }),
    );
    expect(result.user.id).toBe('user-001');
    expect(result.user.username).toBe('alice');
    expect(result.user.roles).toEqual([{ id: 'role-001', name: 'Auditor' }]);
    expect(result.permissions).toContain('read:audit-logs:*');
    expect(typeof result.token).toBe('string');
    expect(result.token.split('.')).toHaveLength(3);
  });

  it('treats lockedUntil in the PAST as expired (does not block login)', async () => {
    const hash = await bcrypt.hash('RealPass', 4);
    const past = new Date(Date.now() - 10 * 60 * 1000);
    mockAuthRepo.findUserByUsername.mockResolvedValue(
      makeActiveUser({ passwordHash: hash, lockedUntil: past }),
    );

    const result = await login('alice', 'RealPass', IP);
    expect(result.token).toBeDefined();
  });
});
