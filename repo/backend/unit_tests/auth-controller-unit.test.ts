import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../src/modules/auth/service.js', () => ({
  login: vi.fn(),
  toUserResponse: vi.fn(),
  decodePermissions: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../src/modules/auth/repository.js', () => ({
  findUserById: vi.fn(),
  recordSecurityEvent: vi.fn(),
  findRolesByIds: vi.fn(),
  createUser: vi.fn(),
}));

const authService = await import('../src/modules/auth/service.js');
const authRepo = await import('../src/modules/auth/repository.js');
const controller = await import('../src/modules/auth/controller.js');

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;

  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('auth controller unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loginHandler returns 200 with session envelope', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      token: 'jwt-token',
      permissions: ['read:auth:*'],
      user: { id: 'u1', username: 'demo.admin' },
    } as any);

    const req = {
      body: { username: 'demo.admin', password: 'password' },
      ip: '127.0.0.1',
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await controller.loginHandler(req, res, next);

    expect(authService.login).toHaveBeenCalledWith('demo.admin', 'password', '127.0.0.1');
    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(200);
    expect((res.json as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      success: true,
      data: {
        token: 'jwt-token',
        permissions: ['read:auth:*'],
        user: { id: 'u1', username: 'demo.admin' },
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('getMeHandler returns UnauthorizedError when user does not exist', async () => {
    vi.mocked(authRepo.findUserById).mockResolvedValue(null as any);

    const req = {
      user: { userId: 'missing-user' },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await controller.getMeHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as { message?: string };
    expect(err?.message).toBe('User not found');
  });
});
