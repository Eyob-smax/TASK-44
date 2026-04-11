-- CampusOps — Initial Schema Migration
-- MySQL 8.0 — Disconnected LAN Deployment
-- Derived from Prisma schema for reference/portability

-- ============================================================================
-- AUTH & SECURITY
-- ============================================================================

CREATE TABLE users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  org_id VARCHAR(36) NULL
) COMMENT='System users with login credentials';

CREATE TABLE roles (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(500) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='RBAC roles: Administrator, Operations Manager, Classroom Supervisor, Customer Service Agent, Auditor';

CREATE TABLE permissions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  scope VARCHAR(100) NOT NULL DEFAULT '*',
  UNIQUE KEY uq_permissions_action_resource_scope (action, resource, scope)
) COMMENT='Granular action/resource/scope permission definitions';

CREATE TABLE user_roles (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  role_id VARCHAR(36) NOT NULL,
  UNIQUE KEY uq_user_roles (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE role_permissions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  role_id VARCHAR(36) NOT NULL,
  permission_id VARCHAR(36) NOT NULL,
  UNIQUE KEY uq_role_permissions (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE login_attempts (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NULL,
  username VARCHAR(100) NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_attempts_username_ts (username, timestamp),
  CONSTRAINT fk_login_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) COMMENT='Login attempt audit trail';

CREATE TABLE security_events (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  user_id VARCHAR(36) NULL,
  details TEXT NOT NULL COMMENT 'AES-256 encrypted at rest',
  ip_address VARCHAR(45) NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_events_type_ts (event_type, timestamp),
  CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) COMMENT='Security-sensitive event audit log — details field encrypted';

CREATE TABLE field_masking_rules (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  role_id VARCHAR(36) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  field VARCHAR(100) NOT NULL,
  mask_type VARCHAR(50) NOT NULL COMMENT 'full, partial, hash',
  UNIQUE KEY uq_field_masking (role_id, resource, field),
  CONSTRAINT fk_field_masking_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) COMMENT='Per-role PII field masking configuration';

-- ============================================================================
-- MASTER DATA
-- ============================================================================

CREATE TABLE organizations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL COMMENT 'district, school, campus_group',
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Chicago',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE users ADD CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE users ADD INDEX idx_users_org (org_id);

CREATE TABLE campuses (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  address VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_campuses_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE departments (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  campus_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_campus_code (campus_id, code),
  CONSTRAINT fk_departments_campus FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE
);

CREATE TABLE courses (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  dept_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(20) NOT NULL,
  credits INT NOT NULL DEFAULT 3,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_courses_dept_code (dept_id, code),
  CONSTRAINT fk_courses_dept FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE CASCADE
);

CREATE TABLE semesters (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_semesters_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE classes (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  course_id VARCHAR(36) NOT NULL,
  semester_id VARCHAR(36) NOT NULL,
  section VARCHAR(20) NOT NULL,
  capacity INT NOT NULL DEFAULT 30,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_classes_course_semester_section (course_id, semester_id, section),
  CONSTRAINT fk_classes_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_classes_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
);

CREATE TABLE students (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  student_number VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(200) NULL,
  enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_students_org_number (org_id, student_number),
  CONSTRAINT fk_students_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE class_enrollments (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  class_id VARCHAR(36) NOT NULL,
  student_id VARCHAR(36) NOT NULL,
  enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_enrollments (class_id, student_id),
  CONSTRAINT fk_enrollments_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ============================================================================
-- CLASSROOM OPERATIONS
-- ============================================================================

CREATE TABLE classrooms (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  campus_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  building VARCHAR(100) NULL,
  room VARCHAR(50) NULL,
  capacity INT NOT NULL DEFAULT 30,
  status VARCHAR(20) NOT NULL DEFAULT 'offline' COMMENT 'online, offline, degraded',
  last_heartbeat_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_classrooms_campus FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE
) COMMENT='Classroom units with heartbeat-derived online status';

CREATE TABLE classroom_heartbeats (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  classroom_id VARCHAR(36) NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT NULL COMMENT 'JSON payload from classroom agent',
  INDEX idx_heartbeats_classroom_ts (classroom_id, received_at),
  CONSTRAINT fk_heartbeats_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE
);

CREATE TABLE recognition_confidence_samples (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  classroom_id VARCHAR(36) NOT NULL,
  confidence FLOAT NOT NULL COMMENT '0.0 to 1.0',
  sampled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_confidence_classroom_ts (classroom_id, sampled_at),
  CONSTRAINT fk_confidence_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE
);

CREATE TABLE anomaly_events (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  classroom_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL COMMENT 'connectivity_loss, confidence_drop, unauthorized_access, etc.',
  severity VARCHAR(20) NOT NULL COMMENT 'low, medium, high, critical',
  description TEXT NULL,
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT 'open, acknowledged, assigned, resolved',
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_anomaly_status (status),
  INDEX idx_anomaly_classroom_ts (classroom_id, detected_at),
  CONSTRAINT fk_anomaly_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE
);

CREATE TABLE anomaly_acknowledgements (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  anomaly_event_id VARCHAR(36) NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ack_anomaly FOREIGN KEY (anomaly_event_id) REFERENCES anomaly_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_ack_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE anomaly_assignments (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  anomaly_event_id VARCHAR(36) NOT NULL UNIQUE,
  assigned_to_user_id VARCHAR(36) NOT NULL,
  assigned_by_user_id VARCHAR(36) NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assign_anomaly FOREIGN KEY (anomaly_event_id) REFERENCES anomaly_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_to FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
  CONSTRAINT fk_assign_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
);

CREATE TABLE anomaly_resolutions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  anomaly_event_id VARCHAR(36) NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  resolution_note TEXT NOT NULL COMMENT 'REQUIRED — cannot be empty, enforced in application layer',
  resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resolve_anomaly FOREIGN KEY (anomaly_event_id) REFERENCES anomaly_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_resolve_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================================
-- PARKING OPERATIONS
-- ============================================================================

CREATE TABLE parking_facilities (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  campus_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  total_spaces INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_parking_facility_campus FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE
);

CREATE TABLE parking_spaces (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  facility_id VARCHAR(36) NOT NULL,
  label VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_parking_space_label (facility_id, label),
  CONSTRAINT fk_parking_space_facility FOREIGN KEY (facility_id) REFERENCES parking_facilities(id) ON DELETE CASCADE
);

CREATE TABLE parking_readers (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  facility_id VARCHAR(36) NOT NULL,
  type VARCHAR(10) NOT NULL COMMENT 'entry, exit',
  location VARCHAR(200) NOT NULL,
  CONSTRAINT fk_parking_reader_facility FOREIGN KEY (facility_id) REFERENCES parking_facilities(id) ON DELETE CASCADE
);

CREATE TABLE file_assets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  original_name VARCHAR(500) NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  mime_type VARCHAR(50) NOT NULL COMMENT 'image/jpeg, image/png, etc.',
  size_bytes INT NOT NULL,
  width INT NULL,
  height INT NULL,
  perceptual_hash VARCHAR(64) NULL,
  uploaded_by_user_id VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_file_assets_phash (perceptual_hash),
  CONSTRAINT fk_file_assets_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
) COMMENT='Local disk object storage references — 10MB cap, JPEG/PNG only';

CREATE TABLE parking_events (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  reader_id VARCHAR(36) NOT NULL,
  plate_number VARCHAR(20) NULL COMMENT 'null when no plate captured',
  event_type VARCHAR(10) NOT NULL COMMENT 'entry, exit',
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  image_asset_id VARCHAR(36) NULL,
  INDEX idx_parking_events_plate_ts (plate_number, captured_at),
  CONSTRAINT fk_parking_event_reader FOREIGN KEY (reader_id) REFERENCES parking_readers(id) ON DELETE CASCADE,
  CONSTRAINT fk_parking_event_image FOREIGN KEY (image_asset_id) REFERENCES file_assets(id) ON DELETE SET NULL
);

CREATE TABLE parking_sessions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  facility_id VARCHAR(36) NOT NULL,
  plate_number VARCHAR(20) NOT NULL,
  entry_event_id VARCHAR(36) NOT NULL UNIQUE,
  exit_event_id VARCHAR(36) NULL UNIQUE,
  entry_at DATETIME NOT NULL,
  exit_at DATETIME NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active, completed, exception',
  INDEX idx_parking_sessions_facility_status (facility_id, status),
  INDEX idx_parking_sessions_plate_entry (plate_number, entry_at),
  CONSTRAINT fk_session_facility FOREIGN KEY (facility_id) REFERENCES parking_facilities(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_entry_event FOREIGN KEY (entry_event_id) REFERENCES parking_events(id),
  CONSTRAINT fk_session_exit_event FOREIGN KEY (exit_event_id) REFERENCES parking_events(id)
);

CREATE TABLE parking_exceptions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  facility_id VARCHAR(36) NOT NULL,
  type VARCHAR(30) NOT NULL COMMENT 'no_plate, overtime, unsettled, duplicate_plate, inconsistent_entry_exit',
  related_session_id VARCHAR(36) NULL,
  related_event_id VARCHAR(36) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT 'open, escalated, resolved',
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  escalated_at DATETIME NULL,
  resolved_at DATETIME NULL,
  resolution_note TEXT NULL COMMENT 'REQUIRED for closure — enforced in application layer',
  INDEX idx_parking_exceptions_status_ts (status, created_at),
  INDEX idx_parking_exceptions_facility (facility_id, status),
  CONSTRAINT fk_exception_facility FOREIGN KEY (facility_id) REFERENCES parking_facilities(id) ON DELETE CASCADE,
  CONSTRAINT fk_exception_session FOREIGN KEY (related_session_id) REFERENCES parking_sessions(id) ON DELETE SET NULL
) COMMENT='15-minute escalation rule: unresolved exceptions auto-escalate to supervisor queue';

CREATE TABLE parking_escalations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  exception_id VARCHAR(36) NOT NULL UNIQUE,
  escalated_to_user_id VARCHAR(36) NOT NULL,
  escalated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME NULL,
  CONSTRAINT fk_escalation_exception FOREIGN KEY (exception_id) REFERENCES parking_exceptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_escalation_user FOREIGN KEY (escalated_to_user_id) REFERENCES users(id)
);

-- ============================================================================
-- LOGISTICS
-- ============================================================================

CREATE TABLE warehouses (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  address VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_warehouses_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE carriers (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  connector_type VARCHAR(50) NOT NULL COMMENT 'rest_api, file_drop, manual',
  connector_config TEXT NULL COMMENT 'JSON — encrypted connection details',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_carriers_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE delivery_zones (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  region_code VARCHAR(20) NOT NULL,
  zip_patterns TEXT NOT NULL COMMENT 'JSON array of ZIP prefix patterns',
  CONSTRAINT fk_delivery_zones_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE non_serviceable_zips (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  zip_code VARCHAR(10) NOT NULL,
  reason VARCHAR(500) NULL,
  UNIQUE KEY uq_non_serviceable_zip (org_id, zip_code),
  CONSTRAINT fk_non_serviceable_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE shipping_fee_templates (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  base_fee DECIMAL(10,2) NOT NULL COMMENT 'e.g. $6.95',
  base_weight_lb DECIMAL(10,2) NOT NULL COMMENT 'e.g. 2.00 lb',
  per_additional_lb_fee DECIMAL(10,2) NOT NULL COMMENT 'e.g. $1.25',
  region_code VARCHAR(20) NOT NULL,
  tier VARCHAR(50) NOT NULL COMMENT 'standard, express, priority',
  min_items INT NOT NULL DEFAULT 1,
  max_items INT NULL COMMENT 'null = unlimited',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shipping_templates_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE shipping_fee_surcharges (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  template_id VARCHAR(36) NOT NULL,
  `condition` VARCHAR(50) NOT NULL COMMENT 'alaska_hawaii, oversize, hazmat',
  surcharge_amount DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_surcharges_template FOREIGN KEY (template_id) REFERENCES shipping_fee_templates(id) ON DELETE CASCADE
);

CREATE TABLE shipments (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  warehouse_id VARCHAR(36) NOT NULL,
  carrier_id VARCHAR(36) NOT NULL,
  tracking_number VARCHAR(100) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' COMMENT 'pending, picked, shipped, in_transit, delivered, exception',
  shipped_at DATETIME NULL,
  delivered_at DATETIME NULL,
  estimated_delivery_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shipments_tracking (tracking_number),
  INDEX idx_shipments_status (status),
  CONSTRAINT fk_shipments_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_shipments_carrier FOREIGN KEY (carrier_id) REFERENCES carriers(id)
);

CREATE TABLE parcels (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  description VARCHAR(500) NOT NULL,
  weight_lb DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  CONSTRAINT fk_parcels_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE TABLE tracking_updates (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  status VARCHAR(50) NOT NULL,
  location VARCHAR(200) NULL,
  timestamp DATETIME NOT NULL,
  source VARCHAR(50) NOT NULL COMMENT 'carrier_sync, manual',
  INDEX idx_tracking_shipment_ts (shipment_id, timestamp),
  CONSTRAINT fk_tracking_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE TABLE carrier_sync_cursors (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  carrier_id VARCHAR(36) NOT NULL UNIQUE,
  last_sync_at DATETIME NULL,
  last_success_cursor VARCHAR(500) NULL,
  error_state TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sync_cursor_carrier FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE CASCADE
);

-- ============================================================================
-- AFTER-SALES
-- ============================================================================

CREATE TABLE compensation_policies (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL COMMENT 'delivery_late_48h, lost_item, damaged_item',
  compensation_amount DECIMAL(10,2) NOT NULL COMMENT 'e.g. $10.00',
  max_cap_per_ticket DECIMAL(10,2) NOT NULL COMMENT 'e.g. $50.00',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_comp_policies_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE after_sales_tickets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL COMMENT 'delay, dispute, lost_item',
  shipment_id VARCHAR(36) NULL,
  parcel_id VARCHAR(36) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open' COMMENT 'open, investigating, pending_approval, resolved, closed',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' COMMENT 'low, medium, high, urgent',
  created_by_user_id VARCHAR(36) NOT NULL,
  assigned_to_user_id VARCHAR(36) NULL,
  sla_deadline_at DATETIME NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_org_ts (org_id, created_at),
  INDEX idx_tickets_assigned_status (assigned_to_user_id, status),
  CONSTRAINT fk_tickets_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_parcel FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_tickets_assigned_to FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
) COMMENT='After-sales tickets: delay, dispute, lost-item cases with evidence and compensation';

CREATE TABLE ticket_timelines (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ticket_id VARCHAR(36) NOT NULL,
  entry_type VARCHAR(50) NOT NULL COMMENT 'created, assigned, note, status_change, compensation, evidence_added, resolved',
  content TEXT NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timeline_ticket_ts (ticket_id, created_at),
  CONSTRAINT fk_timeline_ticket FOREIGN KEY (ticket_id) REFERENCES after_sales_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_timeline_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE evidence_assets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ticket_id VARCHAR(36) NOT NULL,
  file_asset_id VARCHAR(36) NOT NULL,
  description VARCHAR(500) NULL,
  uploaded_by_user_id VARCHAR(36) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evidence_ticket FOREIGN KEY (ticket_id) REFERENCES after_sales_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_file FOREIGN KEY (file_asset_id) REFERENCES file_assets(id),
  CONSTRAINT fk_evidence_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
);

CREATE TABLE compensation_suggestions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ticket_id VARCHAR(36) NOT NULL,
  policy_id VARCHAR(36) NOT NULL,
  suggested_amount DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, approved, rejected',
  CONSTRAINT fk_suggestion_ticket FOREIGN KEY (ticket_id) REFERENCES after_sales_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_suggestion_policy FOREIGN KEY (policy_id) REFERENCES compensation_policies(id)
);

CREATE TABLE compensation_approvals (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  suggestion_id VARCHAR(36) NOT NULL UNIQUE,
  approved_by_user_id VARCHAR(36) NOT NULL,
  decision VARCHAR(20) NOT NULL COMMENT 'approved, rejected',
  notes TEXT NULL,
  decided_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_approval_suggestion FOREIGN KEY (suggestion_id) REFERENCES compensation_suggestions(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_user FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
);

-- ============================================================================
-- MEMBERSHIPS
-- ============================================================================

CREATE TABLE membership_tiers (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  level INT NOT NULL COMMENT '1 = base, 2, 3, etc.',
  points_threshold INT NOT NULL,
  benefits TEXT NOT NULL COMMENT 'JSON: list of benefit descriptions',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tier_org_level (org_id, level),
  CONSTRAINT fk_tiers_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE members (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NULL,
  student_id VARCHAR(36) NULL,
  tier_id VARCHAR(36) NOT NULL,
  growth_points INT NOT NULL DEFAULT 0,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_members_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_members_tier FOREIGN KEY (tier_id) REFERENCES membership_tiers(id)
);

CREATE TABLE growth_point_transactions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  member_id VARCHAR(36) NOT NULL,
  points INT NOT NULL COMMENT 'positive = earn, negative = redeem',
  reason VARCHAR(200) NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id VARCHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_points_member_ts (member_id, created_at),
  CONSTRAINT fk_points_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE coupons (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  code VARCHAR(50) NOT NULL,
  discount_type VARCHAR(20) NOT NULL COMMENT 'percentage, fixed_amount',
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) NULL,
  tier_id VARCHAR(36) NULL COMMENT 'null = all tiers',
  expires_at DATETIME NULL,
  max_redemptions INT NULL,
  current_redemptions INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupons_org_code (org_id, code),
  CONSTRAINT fk_coupons_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_coupons_tier FOREIGN KEY (tier_id) REFERENCES membership_tiers(id) ON DELETE SET NULL
);

CREATE TABLE coupon_redemptions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  coupon_id VARCHAR(36) NOT NULL,
  member_id VARCHAR(36) NOT NULL,
  fulfillment_request_id VARCHAR(36) NULL,
  redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_redemption_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  CONSTRAINT fk_redemption_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE member_pricing_rules (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  tier_id VARCHAR(36) NOT NULL,
  item_category VARCHAR(100) NOT NULL,
  discount_percent DECIMAL(5,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pricing_rules_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_pricing_rules_tier FOREIGN KEY (tier_id) REFERENCES membership_tiers(id) ON DELETE CASCADE
);

CREATE TABLE stored_value_wallets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  member_id VARCHAR(36) NOT NULL UNIQUE,
  encrypted_balance TEXT NOT NULL COMMENT 'AES-256 encrypted balance',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallets_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) COMMENT='Wallet balances encrypted at rest — optional feature, org-level toggle';

CREATE TABLE wallet_ledger_entries (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  wallet_id VARCHAR(36) NOT NULL,
  entry_type VARCHAR(20) NOT NULL COMMENT 'topup, spend, refund',
  amount DECIMAL(10,2) NOT NULL COMMENT 'always positive',
  reference_type VARCHAR(50) NULL,
  reference_id VARCHAR(36) NULL,
  balance_before DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger_wallet_ts (wallet_id, created_at),
  CONSTRAINT fk_ledger_wallet FOREIGN KEY (wallet_id) REFERENCES stored_value_wallets(id) ON DELETE CASCADE
) COMMENT='Append-only wallet ledger — no UPDATE or DELETE allowed in application layer';

CREATE TABLE fulfillment_requests (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  member_id VARCHAR(36) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' COMMENT 'draft, submitted, processing, completed, cancelled',
  total_amount DECIMAL(10,2) NOT NULL,
  shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  final_amount DECIMAL(10,2) NOT NULL,
  idempotency_key VARCHAR(64) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fulfillment_org_ts (org_id, created_at),
  CONSTRAINT fk_fulfillment_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_fulfillment_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE fulfillment_line_items (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL,
  description VARCHAR(500) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  member_price DECIMAL(10,2) NULL COMMENT 'null if no member pricing applied',
  CONSTRAINT fk_line_items_request FOREIGN KEY (request_id) REFERENCES fulfillment_requests(id) ON DELETE CASCADE
);

CREATE TABLE printable_receipts (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  fulfillment_request_id VARCHAR(36) NULL,
  wallet_ledger_entry_id VARCHAR(36) NULL,
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  file_asset_id VARCHAR(36) NULL,
  CONSTRAINT fk_receipts_fulfillment FOREIGN KEY (fulfillment_request_id) REFERENCES fulfillment_requests(id) ON DELETE SET NULL,
  CONSTRAINT fk_receipts_ledger FOREIGN KEY (wallet_ledger_entry_id) REFERENCES wallet_ledger_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_receipts_file FOREIGN KEY (file_asset_id) REFERENCES file_assets(id) ON DELETE SET NULL
);

-- Add FK for coupon_redemptions → fulfillment_requests (deferred due to table creation order)
ALTER TABLE coupon_redemptions
  ADD CONSTRAINT fk_redemption_fulfillment FOREIGN KEY (fulfillment_request_id) REFERENCES fulfillment_requests(id) ON DELETE SET NULL;

-- ============================================================================
-- OBSERVABILITY
-- ============================================================================

CREATE TABLE runtime_metrics (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  metric_name VARCHAR(100) NOT NULL COMMENT 'p95_latency, cpu_utilization, gpu_utilization, error_rate',
  value FLOAT NOT NULL,
  unit VARCHAR(20) NOT NULL COMMENT 'ms, percent, count',
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_metrics_name_ts (metric_name, collected_at)
);

CREATE TABLE application_logs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  level VARCHAR(10) NOT NULL COMMENT 'debug, info, warn, error',
  message TEXT NOT NULL,
  context TEXT NULL COMMENT 'JSON metadata',
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  org_id VARCHAR(36) NULL COMMENT 'NULL = platform-wide log',
  INDEX idx_logs_ts (timestamp),
  INDEX idx_logs_level_ts (level, timestamp),
  INDEX idx_app_logs_org (org_id)
) COMMENT='30-day retention enforced by background cleanup job';

CREATE TABLE alert_thresholds (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  metric_name VARCHAR(100) NOT NULL,
  operator VARCHAR(10) NOT NULL COMMENT 'gt, gte, lt, lte, eq',
  threshold_value FLOAT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  org_id VARCHAR(36) NULL COMMENT 'NULL = platform-wide threshold',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_alert_thresholds_org (org_id)
);

CREATE TABLE alert_events (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  threshold_id VARCHAR(36) NOT NULL,
  metric_value FLOAT NOT NULL,
  triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME NULL,
  acknowledged_by_user_id VARCHAR(36) NULL,
  org_id VARCHAR(36) NULL COMMENT 'NULL = platform-wide alert',
  INDEX idx_alert_events_ts (triggered_at),
  INDEX idx_alert_events_org (org_id),
  CONSTRAINT fk_alert_threshold FOREIGN KEY (threshold_id) REFERENCES alert_thresholds(id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_ack_user FOREIGN KEY (acknowledged_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE notification_events (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  alert_event_id VARCHAR(36) NULL,
  type VARCHAR(20) NOT NULL COMMENT 'banner, audible',
  message TEXT NOT NULL,
  target_role_id VARCHAR(36) NULL,
  org_id VARCHAR(36) NULL COMMENT 'NULL = broadcast to all orgs',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  INDEX idx_notifications_ts (created_at),
  INDEX idx_notifications_org (org_id),
  CONSTRAINT fk_notification_role FOREIGN KEY (target_role_id) REFERENCES roles(id) ON DELETE SET NULL
);

-- ============================================================================
-- JOBS & FILES
-- ============================================================================

CREATE TABLE import_jobs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL COMMENT 'students, classes, departments, courses',
  file_name VARCHAR(500) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' COMMENT 'pending, processing, partial_success, success, failed',
  total_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  error_report_asset_id VARCHAR(36) NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_by_user_id VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_import_jobs_status (status),
  CONSTRAINT fk_import_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_import_error_report FOREIGN KEY (error_report_asset_id) REFERENCES file_assets(id) ON DELETE SET NULL
);

CREATE TABLE import_row_errors (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  import_job_id VARCHAR(36) NOT NULL,
  row_number INT NOT NULL,
  field VARCHAR(100) NOT NULL,
  error_message VARCHAR(500) NOT NULL,
  raw_value TEXT NULL,
  INDEX idx_row_errors_job (import_job_id),
  CONSTRAINT fk_row_errors_job FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
);

CREATE TABLE export_jobs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  format VARCHAR(10) NOT NULL COMMENT 'xlsx, csv',
  status VARCHAR(30) NOT NULL DEFAULT 'pending' COMMENT 'pending, processing, completed, failed',
  file_asset_id VARCHAR(36) NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_by_user_id VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_export_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_export_file FOREIGN KEY (file_asset_id) REFERENCES file_assets(id) ON DELETE SET NULL
);

CREATE TABLE background_jobs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  type VARCHAR(100) NOT NULL COMMENT 'import, export, carrier_sync, backup, log_retention, escalation_check',
  payload TEXT NULL COMMENT 'JSON',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, running, completed, failed',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT NULL,
  scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bg_jobs_status_scheduled (status, scheduled_at),
  INDEX idx_bg_jobs_type_status (type, status)
) COMMENT='DB-backed background job queue for imports, exports, sync, backups, and maintenance';

CREATE TABLE perceptual_hashes (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  file_asset_id VARCHAR(36) NOT NULL,
  hash_value VARCHAR(64) NOT NULL,
  algorithm VARCHAR(20) NOT NULL COMMENT 'phash, dhash',
  UNIQUE KEY uq_phash_file_algo (file_asset_id, algorithm),
  INDEX idx_phash_value (hash_value),
  CONSTRAINT fk_phash_file FOREIGN KEY (file_asset_id) REFERENCES file_assets(id) ON DELETE CASCADE
);

-- ============================================================================
-- BACKUP & RESTORE
-- ============================================================================

CREATE TABLE backup_records (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  type VARCHAR(20) NOT NULL DEFAULT 'full',
  storage_path VARCHAR(1000) NOT NULL,
  size_bytes BIGINT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running' COMMENT 'running, completed, failed',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  expires_at DATETIME NOT NULL COMMENT '14-day retention',
  INDEX idx_backup_expires (expires_at),
  INDEX idx_backup_status (status)
) COMMENT='Daily full backup records — 14-day retention to separate local disk';

CREATE TABLE restore_runs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  backup_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running' COMMENT 'running, completed, failed',
  verification_result TEXT NULL COMMENT 'JSON summary of verification checks',
  performed_by_user_id VARCHAR(36) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_restore_backup FOREIGN KEY (backup_id) REFERENCES backup_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_restore_user FOREIGN KEY (performed_by_user_id) REFERENCES users(id)
);

-- ============================================================================
-- IDEMPOTENCY
-- ============================================================================

CREATE TABLE idempotency_records (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  `key` VARCHAR(64) NOT NULL UNIQUE,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  status_code INT NOT NULL,
  response_body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_idempotency_expires (expires_at)
) COMMENT='Idempotency key store for create/update operations — expired records cleaned by background job';
