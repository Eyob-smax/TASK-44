import { describe, it, expect } from 'vitest';
import { PERMISSIONS, parsePermission, hasAnyRole } from '../src/utils/permissions.js';

describe('hasAnyRole', () => {
  it('returns false when user has Auditor but Administrator is required', () => {
    expect(hasAnyRole(['Auditor'], 'Administrator')).toBe(false);
  });

  it('returns true when user has Administrator and either Administrator or OpsManager is required', () => {
    expect(hasAnyRole(['Administrator'], 'Administrator', 'OpsManager')).toBe(true);
  });

  it('returns true when user has OpsManager and that is one of the required roles', () => {
    expect(hasAnyRole(['OpsManager'], 'Administrator', 'OpsManager')).toBe(true);
  });

  it('returns false when user has no roles', () => {
    expect(hasAnyRole([], 'Administrator')).toBe(false);
  });

  it('returns true when user has multiple roles and one matches', () => {
    expect(hasAnyRole(['Auditor', 'ClassroomSupervisor'], 'ClassroomSupervisor')).toBe(true);
  });
});

describe('parsePermission', () => {
  it('splits "read:students:*" into action, resource, scope', () => {
    const result = parsePermission('read:students:*');
    expect(result).toEqual({ action: 'read', resource: 'students', scope: '*' });
  });

  it('splits a write permission correctly', () => {
    const result = parsePermission('write:master-data:*');
    expect(result).toEqual({ action: 'write', resource: 'master-data', scope: '*' });
  });

  it('handles a permission with a specific scope', () => {
    const result = parsePermission('approve:after-sales:campus-001');
    expect(result).toEqual({ action: 'approve', resource: 'after-sales', scope: 'campus-001' });
  });
});

describe('PERMISSIONS constant', () => {
  it('contains expected auth permission keys', () => {
    expect(PERMISSIONS.AUTH_READ_ME).toBeDefined();
    expect(PERMISSIONS.AUTH_CREATE_USER).toBeDefined();
  });

  it('contains expected master-data keys', () => {
    expect(PERMISSIONS.MASTER_DATA_READ).toBeDefined();
    expect(PERMISSIONS.MASTER_DATA_WRITE).toBeDefined();
  });

  it('contains expected after-sales approve key', () => {
    expect(PERMISSIONS.AFTER_SALES_APPROVE).toBeDefined();
  });

  it('all permission values follow action:resource:scope format', () => {
    for (const value of Object.values(PERMISSIONS)) {
      const parts = value.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]!.length).toBeGreaterThan(0);
      expect(parts[1]!.length).toBeGreaterThan(0);
      expect(parts[2]!.length).toBeGreaterThan(0);
    }
  });
});
