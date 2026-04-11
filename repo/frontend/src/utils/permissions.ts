// Permission vocabulary — mirrors backend Permission registry.
// Format: action:resource:scope
// Used by route meta guards (Prompt 5) and component-level checks (Prompt 6-7).

export const PERMISSIONS = {
  // Auth
  AUTH_READ_ME: 'read:auth:*',
  AUTH_CREATE_USER: 'create:users:*',

  // Master data
  MASTER_DATA_READ: 'read:master-data:*',
  MASTER_DATA_WRITE: 'write:master-data:*',

  // Classroom ops
  CLASSROOM_OPS_READ: 'read:classroom-ops:*',
  CLASSROOM_OPS_WRITE: 'write:classroom-ops:*',
  CLASSROOM_OPS_RESOLVE: 'resolve:classroom-ops:*',

  // Parking
  PARKING_READ: 'read:parking:*',
  PARKING_WRITE: 'write:parking:*',
  PARKING_ESCALATE: 'escalate:parking:*',

  // Logistics
  LOGISTICS_READ: 'read:logistics:*',
  LOGISTICS_WRITE: 'write:logistics:*',

  // After-sales
  AFTER_SALES_READ: 'read:after-sales:*',
  AFTER_SALES_WRITE: 'write:after-sales:*',
  AFTER_SALES_APPROVE: 'approve:after-sales:*',

  // Memberships
  MEMBERSHIP_READ: 'read:memberships:*',
  MEMBERSHIP_WRITE: 'write:memberships:*',

  // Observability
  OBSERVABILITY_READ: 'read:observability:*',

  // Configuration
  CONFIG_READ: 'read:configuration:*',
  CONFIG_WRITE: 'write:configuration:*',

  // Backup & restore
  BACKUP_READ: 'read:backups:*',
  BACKUP_RESTORE: 'restore:backups:*',
} as const;

export type PermissionString = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function parsePermission(str: string): {
  action: string;
  resource: string;
  scope: string;
} {
  const parts = str.split(':');
  return {
    action: parts[0] ?? '',
    resource: parts[1] ?? '',
    scope: parts[2] ?? '',
  };
}

export function hasAnyRole(userRoles: string[], ...required: string[]): boolean {
  return required.some((r) => userRoles.includes(r));
}
