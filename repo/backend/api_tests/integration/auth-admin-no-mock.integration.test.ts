import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app/server.js';
import { db } from '../../src/app/container.js';

const RUN_ID = `auth-admin-int-${Date.now()}`;

let orgId = '';
let adminRoleId = '';
let opsRoleId = '';
let permissionId = '';
let adminUserId = '';
let createdUserId = '';
let authToken = '';
let createdAdminRole = false;

const app = createApp();

describe('No-mock full app integration: auth + admin users', () => {
  beforeAll(async () => {
    const org = await db.organization.create({
      data: {
        name: `Auth Org ${RUN_ID}`,
        type: 'district',
        timezone: 'UTC',
      },
    });
    orgId = org.id;

    const existingAdminRole = await db.role.findUnique({ where: { name: 'Administrator' } });
    if (existingAdminRole) {
      adminRoleId = existingAdminRole.id;
    } else {
      const created = await db.role.create({
        data: {
          name: 'Administrator',
          description: 'Integration administrator role',
          isSystem: false,
        },
      });
      adminRoleId = created.id;
      createdAdminRole = true;
    }

    const [opsRole, permission] = await Promise.all([
      db.role.create({
        data: {
          name: `OpsManager-${RUN_ID}`,
          description: 'Integration ops role',
          isSystem: false,
        },
      }),
      db.permission.create({
        data: {
          action: 'read',
          resource: 'auth',
          scope: `int-${RUN_ID}`,
        },
      }),
    ]);

    opsRoleId = opsRole.id;
    permissionId = permission.id;

    await db.rolePermission.create({
      data: {
        roleId: adminRoleId,
        permissionId,
      },
    });

    const passwordHash = await bcrypt.hash('Password#123', 10);
    const adminUser = await db.user.create({
      data: {
        username: `admin_${RUN_ID}`,
        passwordHash,
        salt: 'integration-seed',
        displayName: 'Integration Admin',
        isActive: true,
        orgId,
      },
    });
    adminUserId = adminUser.id;

    await db.userRole.create({
      data: {
        userId: adminUserId,
        roleId: adminRoleId,
      },
    });
  });

  afterAll(async () => {
    await db.idempotencyRecord.deleteMany({ where: { key: { contains: RUN_ID } } });
    await db.userRole.deleteMany({ where: { userId: { in: [adminUserId, createdUserId].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: [adminUserId, createdUserId].filter(Boolean) } } });
    await db.rolePermission.deleteMany({
      where: {
        OR: [
          { permissionId },
          { roleId: opsRoleId },
        ],
      },
    });
    await db.role.deleteMany({ where: { id: opsRoleId } });
    if (createdAdminRole) {
      await db.role.deleteMany({ where: { id: adminRoleId } });
    }
    if (permissionId) {
      await db.permission.deleteMany({ where: { id: permissionId } });
    }
    if (orgId) {
      await db.organization.deleteMany({ where: { id: orgId } });
    }
  });

  it('POST /api/auth/login returns token from real auth service and repository', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Idempotency-Key', `auth-login-${RUN_ID}`)
      .send({
        username: `admin_${RUN_ID}`,
        password: 'Password#123',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data?.token).toBe('string');
    expect(res.body.data?.user?.username).toBe(`admin_${RUN_ID}`);
    authToken = res.body.data.token as string;
  });

  it('GET /api/auth/me returns current user from real repository path', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.user?.id).toBe(adminUserId);
  });

  it('POST /api/auth/logout records logout flow without mocks', async () => {
    const before = await db.securityEvent.count({
      where: { eventType: 'logout', userId: adminUserId },
    });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const after = await db.securityEvent.count({
      where: { eventType: 'logout', userId: adminUserId },
    });
    expect(after).toBe(before + 1);
  });

  it('POST /api/admin/users creates a non-admin user with org assignment', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Idempotency-Key', `auth-create-user-${RUN_ID}`)
      .send({
        username: `ops_${RUN_ID}`,
        password: 'Password#123',
        displayName: 'Integration Ops User',
        roleIds: [opsRoleId],
        orgId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.username).toBe(`ops_${RUN_ID}`);
    expect(res.body.data?.orgId).toBe(orgId);
    createdUserId = res.body.data.id as string;

    const links = await db.userRole.findMany({ where: { userId: createdUserId } });
    expect(links).toHaveLength(1);
    expect(links[0]?.roleId).toBe(opsRoleId);
  });
});
