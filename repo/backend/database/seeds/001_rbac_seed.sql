-- CampusOps — RBAC Bootstrap Seed
-- Idempotent: uses INSERT IGNORE so re-running is safe.
-- Run after applying the schema migration:
--   mysql -u campusops -p campusops < backend/database/seeds/001_rbac_seed.sql

-- ============================================================================
-- ROLES
-- ============================================================================

INSERT IGNORE INTO roles (id, name, description, is_system) VALUES
  ('role-administrator',          'Administrator',          'Full platform access — all modules and admin operations', TRUE),
  ('role-opsmanager',             'OpsManager',             'Day-to-day operations across logistics, after-sales, memberships, and parking', TRUE),
  ('role-classroom-supervisor',   'ClassroomSupervisor',    'Classroom anomaly lifecycle and campus monitoring', TRUE),
  ('role-customer-service-agent', 'CustomerServiceAgent',   'After-sales ticket handling and membership wallet operations', TRUE),
  ('role-auditor',                'Auditor',                'Read-only access to all modules for compliance review', TRUE),
  ('role-viewer',                 'Viewer',                 'Limited read-only access for observers', TRUE);

-- ============================================================================
-- PERMISSIONS
-- Format: action:resource — scope is always '*' for platform-wide grants
-- ============================================================================

INSERT IGNORE INTO permissions (id, action, resource, scope) VALUES
  -- Auth / user management
  ('perm-read-auth',               'read',    'auth',           '*'),
  ('perm-create-users',            'create',  'users',          '*'),

  -- Master data
  ('perm-read-master-data',        'read',    'master-data',    '*'),
  ('perm-write-master-data',       'write',   'master-data',    '*'),

  -- Classroom ops
  ('perm-read-classroom-ops',      'read',    'classroom-ops',  '*'),
  ('perm-write-classroom-ops',     'write',   'classroom-ops',  '*'),
  ('perm-resolve-classroom-ops',   'resolve', 'classroom-ops',  '*'),

  -- Parking
  ('perm-read-parking',            'read',    'parking',        '*'),
  ('perm-write-parking',           'write',   'parking',        '*'),
  ('perm-escalate-parking',        'escalate','parking',        '*'),

  -- Logistics
  ('perm-read-logistics',          'read',    'logistics',      '*'),
  ('perm-write-logistics',         'write',   'logistics',      '*'),

  -- After-sales
  ('perm-read-after-sales',        'read',    'after-sales',    '*'),
  ('perm-write-after-sales',       'write',   'after-sales',    '*'),

  -- Memberships
  ('perm-read-memberships',        'read',    'memberships',    '*'),
  ('perm-write-memberships',       'write',   'memberships',    '*'),

  -- Observability
  ('perm-read-observability',      'read',    'observability',  '*'),
  ('perm-write-observability',     'write',   'observability',  '*'),

  -- Configuration
  ('perm-read-configuration',      'read',    'configuration',  '*'),
  ('perm-write-configuration',     'write',   'configuration',  '*'),

  -- Backups
  ('perm-read-backups',            'read',    'backups',        '*'),
  ('perm-restore-backups',         'restore', 'backups',        '*');

-- ============================================================================
-- ROLE → PERMISSION MAPPINGS
-- ============================================================================

-- Administrator: all permissions
INSERT IGNORE INTO role_permissions (id, role_id, permission_id) VALUES
  ('rp-admin-read-auth',               'role-administrator', 'perm-read-auth'),
  ('rp-admin-create-users',            'role-administrator', 'perm-create-users'),
  ('rp-admin-read-master-data',        'role-administrator', 'perm-read-master-data'),
  ('rp-admin-write-master-data',       'role-administrator', 'perm-write-master-data'),
  ('rp-admin-read-classroom-ops',      'role-administrator', 'perm-read-classroom-ops'),
  ('rp-admin-write-classroom-ops',     'role-administrator', 'perm-write-classroom-ops'),
  ('rp-admin-resolve-classroom-ops',   'role-administrator', 'perm-resolve-classroom-ops'),
  ('rp-admin-read-parking',            'role-administrator', 'perm-read-parking'),
  ('rp-admin-write-parking',           'role-administrator', 'perm-write-parking'),
  ('rp-admin-escalate-parking',        'role-administrator', 'perm-escalate-parking'),
  ('rp-admin-read-logistics',          'role-administrator', 'perm-read-logistics'),
  ('rp-admin-write-logistics',         'role-administrator', 'perm-write-logistics'),
  ('rp-admin-read-after-sales',        'role-administrator', 'perm-read-after-sales'),
  ('rp-admin-write-after-sales',       'role-administrator', 'perm-write-after-sales'),
  ('rp-admin-read-memberships',        'role-administrator', 'perm-read-memberships'),
  ('rp-admin-write-memberships',       'role-administrator', 'perm-write-memberships'),
  ('rp-admin-read-observability',      'role-administrator', 'perm-read-observability'),
  ('rp-admin-write-observability',     'role-administrator', 'perm-write-observability'),
  ('rp-admin-read-configuration',      'role-administrator', 'perm-read-configuration'),
  ('rp-admin-write-configuration',     'role-administrator', 'perm-write-configuration'),
  ('rp-admin-read-backups',            'role-administrator', 'perm-read-backups'),
  ('rp-admin-restore-backups',         'role-administrator', 'perm-restore-backups');

-- OpsManager: read/write operations (no user management, no restore)
INSERT IGNORE INTO role_permissions (id, role_id, permission_id) VALUES
  ('rp-ops-read-auth',               'role-opsmanager', 'perm-read-auth'),
  ('rp-ops-read-master-data',        'role-opsmanager', 'perm-read-master-data'),
  ('rp-ops-write-master-data',       'role-opsmanager', 'perm-write-master-data'),
  ('rp-ops-read-classroom-ops',      'role-opsmanager', 'perm-read-classroom-ops'),
  ('rp-ops-write-classroom-ops',     'role-opsmanager', 'perm-write-classroom-ops'),
  ('rp-ops-resolve-classroom-ops',   'role-opsmanager', 'perm-resolve-classroom-ops'),
  ('rp-ops-read-parking',            'role-opsmanager', 'perm-read-parking'),
  ('rp-ops-write-parking',           'role-opsmanager', 'perm-write-parking'),
  ('rp-ops-escalate-parking',        'role-opsmanager', 'perm-escalate-parking'),
  ('rp-ops-read-logistics',          'role-opsmanager', 'perm-read-logistics'),
  ('rp-ops-write-logistics',         'role-opsmanager', 'perm-write-logistics'),
  ('rp-ops-read-after-sales',        'role-opsmanager', 'perm-read-after-sales'),
  ('rp-ops-write-after-sales',       'role-opsmanager', 'perm-write-after-sales'),
  ('rp-ops-read-memberships',        'role-opsmanager', 'perm-read-memberships'),
  ('rp-ops-write-memberships',       'role-opsmanager', 'perm-write-memberships'),
  ('rp-ops-read-observability',      'role-opsmanager', 'perm-read-observability'),
  ('rp-ops-write-observability',     'role-opsmanager', 'perm-write-observability'),
  ('rp-ops-read-configuration',      'role-opsmanager', 'perm-read-configuration'),
  ('rp-ops-read-backups',            'role-opsmanager', 'perm-read-backups');

-- ClassroomSupervisor: classroom ops + read master-data and parking
INSERT IGNORE INTO role_permissions (id, role_id, permission_id) VALUES
  ('rp-cls-read-auth',               'role-classroom-supervisor', 'perm-read-auth'),
  ('rp-cls-read-master-data',        'role-classroom-supervisor', 'perm-read-master-data'),
  ('rp-cls-read-classroom-ops',      'role-classroom-supervisor', 'perm-read-classroom-ops'),
  ('rp-cls-write-classroom-ops',     'role-classroom-supervisor', 'perm-write-classroom-ops'),
  ('rp-cls-resolve-classroom-ops',   'role-classroom-supervisor', 'perm-resolve-classroom-ops'),
  ('rp-cls-read-parking',            'role-classroom-supervisor', 'perm-read-parking');

-- CustomerServiceAgent: after-sales + memberships
INSERT IGNORE INTO role_permissions (id, role_id, permission_id) VALUES
  ('rp-csa-read-auth',               'role-customer-service-agent', 'perm-read-auth'),
  ('rp-csa-read-after-sales',        'role-customer-service-agent', 'perm-read-after-sales'),
  ('rp-csa-write-after-sales',       'role-customer-service-agent', 'perm-write-after-sales'),
  ('rp-csa-read-memberships',        'role-customer-service-agent', 'perm-read-memberships'),
  ('rp-csa-write-memberships',       'role-customer-service-agent', 'perm-write-memberships');

-- Auditor: read-only everything
INSERT IGNORE INTO role_permissions (id, role_id, permission_id) VALUES
  ('rp-aud-read-auth',               'role-auditor', 'perm-read-auth'),
  ('rp-aud-read-master-data',        'role-auditor', 'perm-read-master-data'),
  ('rp-aud-read-classroom-ops',      'role-auditor', 'perm-read-classroom-ops'),
  ('rp-aud-read-parking',            'role-auditor', 'perm-read-parking'),
  ('rp-aud-read-logistics',          'role-auditor', 'perm-read-logistics'),
  ('rp-aud-read-after-sales',        'role-auditor', 'perm-read-after-sales'),
  ('rp-aud-read-memberships',        'role-auditor', 'perm-read-memberships'),
  ('rp-aud-read-observability',      'role-auditor', 'perm-read-observability'),
  ('rp-aud-read-configuration',      'role-auditor', 'perm-read-configuration'),
  ('rp-aud-read-backups',            'role-auditor', 'perm-read-backups');

-- Viewer: minimal read access
INSERT IGNORE INTO role_permissions (id, role_id, permission_id) VALUES
  ('rp-view-read-auth',              'role-viewer', 'perm-read-auth'),
  ('rp-view-read-master-data',       'role-viewer', 'perm-read-master-data'),
  ('rp-view-read-memberships',       'role-viewer', 'perm-read-memberships');

-- ============================================================================
-- SECURITY NOTE
-- This seed intentionally does NOT create a bootstrap admin credential.
-- Create an initial administrator with operator-provided credentials using:
--   backend/database/seeds/002_bootstrap_admin.sql.example
-- ============================================================================
