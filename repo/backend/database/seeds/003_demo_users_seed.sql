-- CampusOps — Demo Users Seed (Docker/LAN demo only)
--
-- Purpose:
-- - Provide deterministic demo credentials for all system roles.
-- - Keep onboarding reproducible in isolated LAN environments.
--
-- Security note:
-- - This seed is for demo/test environments only.
-- - Rotate or remove these credentials in production.
--
-- Password for all demo users (bcrypt hash below):
--   password

INSERT IGNORE INTO organizations (id, name, type, timezone)
VALUES ('00000000-0000-0000-0000-000000000111', 'CampusOps Demo Organization', 'district', 'UTC');

-- Bcrypt hash for the password "password"
SET @demo_password_hash = '$2a$10$7EqJtq98hPqEX7fNZaFWoOq6.7M3aMcMBXNIN1qNbfXDnpa9eKJe.';

INSERT IGNORE INTO users (id, username, password_hash, salt, display_name, is_active, org_id) VALUES
  ('user-demo-admin',      'demo.admin',      @demo_password_hash, 'demo-seed', 'Demo Administrator', TRUE, '00000000-0000-0000-0000-000000000111'),
  ('user-demo-ops',        'demo.ops',        @demo_password_hash, 'demo-seed', 'Demo OpsManager', TRUE, '00000000-0000-0000-0000-000000000111'),
  ('user-demo-classroom',  'demo.classroom',  @demo_password_hash, 'demo-seed', 'Demo Classroom Supervisor', TRUE, '00000000-0000-0000-0000-000000000111'),
  ('user-demo-cs',         'demo.cs',         @demo_password_hash, 'demo-seed', 'Demo Customer Service Agent', TRUE, '00000000-0000-0000-0000-000000000111'),
  ('user-demo-auditor',    'demo.auditor',    @demo_password_hash, 'demo-seed', 'Demo Auditor', TRUE, '00000000-0000-0000-0000-000000000111'),
  ('user-demo-viewer',     'demo.viewer',     @demo_password_hash, 'demo-seed', 'Demo Viewer', TRUE, '00000000-0000-0000-0000-000000000111');

INSERT IGNORE INTO user_roles (id, user_id, role_id) VALUES
  ('ur-demo-admin',      'user-demo-admin',     'role-administrator'),
  ('ur-demo-ops',        'user-demo-ops',       'role-opsmanager'),
  ('ur-demo-classroom',  'user-demo-classroom', 'role-classroom-supervisor'),
  ('ur-demo-cs',         'user-demo-cs',        'role-customer-service-agent'),
  ('ur-demo-auditor',    'user-demo-auditor',   'role-auditor'),
  ('ur-demo-viewer',     'user-demo-viewer',    'role-viewer');
