import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app/server.js';
import { db } from '../../src/app/container.js';

const RUN_ID = `semantic-no-mock-${Date.now()}`;
const app = createApp();

let orgId = '';
let adminRoleId = '';
let userId = '';
let token = '';

describe('No-mock semantic full-app contracts', () => {
  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `Semantic Org ${RUN_ID}`, type: 'district', timezone: 'UTC' },
    });
    orgId = org.id;

    const existingAdminRole = await db.role.findUnique({ where: { name: 'Administrator' } });
    if (existingAdminRole) {
      adminRoleId = existingAdminRole.id;
    } else {
      const createdRole = await db.role.create({
        data: {
          name: 'Administrator',
          description: 'Integration administrator role for semantic no-mock test',
          isSystem: false,
        },
      });
      adminRoleId = createdRole.id;
    }

    const readObservabilityPermission = await db.permission.upsert({
      where: {
        action_resource_scope: {
          action: 'read',
          resource: 'observability',
          scope: '*',
        },
      },
      update: {},
      create: {
        action: 'read',
        resource: 'observability',
        scope: '*',
      },
    });

    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRoleId,
          permissionId: readObservabilityPermission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRoleId,
        permissionId: readObservabilityPermission.id,
      },
    });

    const user = await db.user.create({
      data: {
        username: `semantic_admin_${RUN_ID}`,
        passwordHash: await bcrypt.hash('Password#123', 10),
        salt: 'semantic',
        displayName: 'Semantic Admin',
        isActive: true,
        orgId,
      },
    });
    userId = user.id;

    await db.userRole.create({ data: { userId, roleId: adminRoleId } });
  });

  afterAll(async () => {
    await db.idempotencyRecord.deleteMany({ where: { key: { contains: RUN_ID } } });
    if (userId) {
      await db.userRole.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    if (orgId) {
      await db.organization.deleteMany({ where: { id: orgId } });
    }
  });

  it('POST /api/auth/login returns token and semantic user payload', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Idempotency-Key', `semantic-login-${RUN_ID}`)
      .send({ username: `semantic_admin_${RUN_ID}`, password: 'Password#123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.username).toBe(`semantic_admin_${RUN_ID}`);
    expect(Array.isArray(res.body.data.user.roles)).toBe(true);
    token = res.body.data.token as string;
  });

  it('GET /api/auth/me returns same user identity and permissions array', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(userId);
    expect(Array.isArray(res.body.data.permissions)).toBe(true);
  });

  it('GET /api/config returns effective config with updatedAt and policy fields', async () => {
    const res = await request(app)
      .get('/api/config')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('config');
    expect(res.body.data).toHaveProperty('updatedAt');
    expect(res.body.data.config).toHaveProperty('heartbeatFreshnessSeconds');
    expect(res.body.data.config).toHaveProperty('logRetentionDays');
  });

  it('GET /api/observability/thresholds returns array contract for authenticated admin', async () => {
    const res = await request(app)
      .get('/api/observability/thresholds')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
