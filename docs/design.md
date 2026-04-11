# CampusOps — System Design Document

## 1. System Overview

CampusOps is a full-stack web application for managing district classroom operations alongside on-premise logistics fulfillment, running entirely on a disconnected local network. It supports five primary roles: Administrator, Operations Manager, Classroom Supervisor, Customer Service Agent, and Auditor.

The platform covers:
- Real-time classroom operations dashboard with online status, recognition confidence, and anomaly event management
- Parking operations with available-space counts, turnover, exception alerts, and 15-minute escalation
- Logistics fulfillment including warehouses, carriers, shipping fee templates, delivery zones, and shipment/parcel tracking
- After-sales ticketing with evidence upload, automated compensation suggestions, manual approval, and SLA timers
- Membership management with tiered benefits, growth points, coupons, member pricing, and optional stored value wallets
- Master data management with bulk import/export from Excel/CSV
- Observability with runtime metrics, searchable logs, configurable alert thresholds, and local notifications
- Security with RBAC, field masking, encrypted sensitive data, TLS on LAN, and daily backups

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Vue 3 + TypeScript + Vite | Vue 3.4+, Vite 5.x |
| Component Library | PrimeVue | 3.53+ |
| Charts | Chart.js + vue-chartjs | 4.x |
| State | Pinia | 2.x |
| HTTP Client | Axios | 1.x |
| Backend | Express + TypeScript | Express 4.x |
| ORM | Prisma | 5.x |
| Validation | Zod | 3.x |
| Database | MySQL | 8.0 |
| Image Processing | Sharp | 0.33+ |
| Excel/CSV | ExcelJS | 4.x |
| PDF | PDFKit | 0.15+ |
| Logging | Winston | 3.x |
| Testing | Vitest | 1.x |
| Containerization | Docker Compose | 3.8 spec |

## 3. Deployment Model

CampusOps runs on an isolated local network with no internet access.

```
┌─────────────────────────────────────────────────┐
│                Disconnected LAN                  │
│                                                  │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   │
│   │ Frontend │   │ Backend  │   │  MySQL   │   │
│   │  :443    │──▶│  :4000   │──▶│  :3306   │   │
│   │  (nginx) │   │ (Express)│   │  (8.0)   │   │
│   └──────────┘   └────┬─────┘   └──────────┘   │
│                       │                          │
│              ┌────────┴────────┐                 │
│              │  Local Disk     │                 │
│              │  /data/object-  │                 │
│              │   storage       │                 │
│              │  /data/backups  │                 │
│              └─────────────────┘                 │
│                                                  │
│         On-prem carrier systems (LAN only)       │
└─────────────────────────────────────────────────┘
```

- **No internet dependency** — all services are self-contained on LAN
- **Docker Compose** orchestrates MySQL, backend, and frontend containers
- **Object storage** uses a mounted local disk path (`/data/object-storage`)
- **Backups** written to a separate mounted disk path (`/data/backups`)
- **TLS** even on LAN — certificates provided by district CA or admin-managed self-signed certs

## 4. Frontend Architecture

The Vue.js web console follows a modular architecture:

```
frontend/src/
├── app/          → App bootstrap, router, layouts, route guards
├── modules/      → Domain-oriented feature modules
│   ├── dashboard/      → Real-time classroom operations dashboard
│   ├── parking/        → Parking operations and exceptions
│   ├── fulfillment/    → Logistics, warehouses, carriers, shipments
│   ├── after-sales/    → Ticketing, compensation, evidence
│   ├── memberships/    → Tiers, points, coupons, wallet, receipts
│   ├── admin/          → Configuration, integrations, backups, users
│   └── observability/  → Metrics, logs, alerts, notifications
├── components/   → Shared presentational and interaction primitives
├── stores/       → Pinia stores and cross-module state
├── services/     → Typed API clients and export helpers
└── utils/        → Formatting, validation, shared constants
```

### API Routing
- **Development**: Vite dev server proxies `/api` requests to `http://localhost:4000`
- **Production (Docker)**: nginx serves built static files over HTTPS and reverse-proxies `/api` to the backend container. See `frontend/nginx.conf` and §18.3 for TLS configuration details.

## 5. Backend Architecture

The Express backend follows a layered controller → service → repository architecture:

```
backend/src/
├── app/          → Server bootstrap, config, dependency wiring
├── common/       → Shared middleware, errors, validation, encryption, storage
├── modules/      → Domain modules (each: controller, service, repository, types, schemas)
│   ├── auth/
│   ├── master-data/
│   ├── classroom-ops/
│   ├── parking/
│   ├── logistics/
│   ├── after-sales/
│   ├── memberships/
│   ├── observability/
│   ├── configuration/
│   └── backups/
├── jobs/         → DB-backed job monitor and workers
└── integrations/ → Carrier connectors and signed integration surfaces
```

Each module contains:
- `types.ts` — Entity interfaces, DTOs, enums, domain functions
- `schemas.ts` — Zod validation schemas for requests
- `controller.ts` — HTTP handlers
- `service.ts` — Business logic orchestration
- `repository.ts` — Data access via Prisma
- `routes.ts` — Express route definitions

## 6. MySQL Persistence

- **Prisma ORM** manages schema, migrations, and type-safe queries
- Schema: `repo/backend/prisma/schema.prisma`
- Raw SQL migrations: `repo/backend/database/migrations/`
- **Referential integrity** enforced via foreign keys with appropriate CASCADE/SET NULL behavior
- **Uniqueness constraints** on student numbers (per org), department codes (per campus), course codes (per dept), coupon codes (per org), idempotency keys
- **Indexes** on frequently queried columns: anomaly status, parking exception status+timestamp, log timestamps, backup expiry

## 7. Object Storage

- Mounted local disk at configurable path (default: `/data/object-storage`)
- File uploads capped at **10 MB per file**
- Only **JPEG and PNG** accepted
- Image compression and cropping via Sharp
- **Perceptual hashing** (pHash/dHash) for duplicate detection
- File metadata stored in `file_assets` table with storage path reference
- No cloud storage, no CDN — fully local

## 8. Background Jobs

DB-backed job monitor pattern using the `background_jobs` table:

- Jobs are enqueued by application code as database rows
- A worker process polls for pending/failed jobs and executes them
- Job types: `import`, `export`, `carrier_sync`, `backup`, `log_retention`, `escalation_check`
- Retry with backoff (configurable `max_attempts`)
- Job status visible in admin UI via job monitor
- Parking exception escalation checks run on a recurring schedule

## 9. Carrier Connectors

On-prem carrier systems are connected via adapter modules:

- **Connector types**: REST API, file drop, manual entry
- Each carrier has a `connectorType` and `connectorConfig` (encrypted)
- Sync is job-driven via `CarrierSyncCursor` — idempotent and resumable
- **Signed privileged requests** for connectors requiring API signing
- Circuit breaker and retry backoff per connector
- Tracking updates flow: carrier → connector → `tracking_updates` table → shipment status
- No internet dependency — all communication stays on LAN

## 10. Observability

- **Runtime metrics**: p95 latency, CPU/GPU utilization, error rate — stored in `runtime_metrics`
- **Application logs**: searchable, 30-day retention enforced by background cleanup job
- **Alert thresholds**: configurable per metric with operator comparison (gt, gte, lt, lte, eq)
- **Alert events**: triggered when metric crosses threshold — visible in admin console
- **Notifications**: banner and audible workstation alerts, role-targeted, no email dependency
- Log search supports level filtering, text search, and date range queries

## 11. Backup & Restore

- **Daily full backups** covering MySQL dump + object storage metadata
- Written to separate mounted disk path (`/data/backups`)
- **14-day retention** — expired backups cleaned by background job
- Backup manifests stored in `backup_records` table
- **Restore verification**: administrative workflow that validates backup readability, schema compatibility, and application-level checks
- Restore runs recorded in `restore_runs` with verification result summaries
- Restore procedures documented for static auditability

## 12. Security Implementation

### 12.1 JWT Lifecycle
- Algorithm: **HS256** — HMAC-SHA256 signed with `JWT_SECRET` (required at startup)
- Default expiry: **8 hours** (`JWT_EXPIRES_IN`, configurable)
- Token is **stateless** — no server-side session store; client discards on logout
- Claims payload: `{ userId, username, roles, permissions }` where permissions are `action:resource:scope` strings
- All permissions are embedded in the token at login time from the `role_permissions` join

### 12.2 Password Hashing (bcrypt)
- Algorithm: **bcrypt** with adaptive cost factor
- Default rounds: **12** (`BCRYPT_ROUNDS`, configurable; fail on missing)
- `bcrypt.genSalt()` then `bcrypt.hash()` — salt stored separately in the `users` table for audit traceability
- `bcrypt.compare()` used for verification — timing-safe by design

### 12.3 Account Lockout Policy
- **5 consecutive failures** → `lockedUntil = now + 30 minutes`
- Same error message for "user not found" and "wrong password" → prevents username enumeration
- `failedAttempts` and `lockedUntil` reset on successful login
- Lockout state persisted in the `users` table

### 12.4 AES-256-GCM Encryption at Rest
- Algorithm: **AES-256-GCM** — authenticated encryption (integrity + confidentiality)
- IV: **12 bytes**, randomly generated per encrypt() call — never reused
- Output format: `base64(iv) + ':' + base64(authTag) + ':' + base64(ciphertext)` — single string
- Key: `Buffer.from(AES_KEY, 'hex')` — must decode to exactly 32 bytes; startup fails if malformed
- Decryption: `setAuthTag()` before `.final()` — throws `InternalError` on tag mismatch (tamper detection)
- Used for: wallet `encryptedBalance`, `security_event.details`, carrier `connectorConfig`

### 12.5 Permission Matrix

| Role | Auth | Master Data R | Master Data W | Classroom Ops | Parking | Logistics | After-Sales Approve | Membership Manage | Wallet Manage | Audit Log View | Admin Config | Backup/Restore |
|------|------|---------------|---------------|---------------|---------|-----------|---------------------|------------------|---------------|----------------|--------------|----------------|
| Administrator | Full | Full | Full | Full | Full | Full | Full | Full | Full | Full | Full | Full |
| Operations Manager | — | Read | Write | Full | Full | Full | Approve | Manage | Manage | — | — | — |
| Classroom Supervisor | — | Read | — | Full | Read | — | — | — | — | — | — | — |
| Customer Service Agent | — | Read | — | Read | — | Read | Write | Read | Read | — | — | — |
| Auditor | — | Read | — | Read | Read | Read | — | Read | — | Read | — | — |

### 12.6 Field Masking
- Rules stored in `field_masking_rules` per `roleId` × `resource`
- Three mask types: `FULL` (`***`), `PARTIAL` (last 4 chars revealed, `****XXXX`), `HASH` (SHA-256 hex truncated to 12 chars)
- Applied in `applyFieldMasking(resource)` middleware on route responses
- **Administrator role bypasses all masking** — sees unmasked data
- 60-second in-process TTL cache on masking rules (keyed by `roleId:resource`) to avoid per-request DB queries
- Strings ≤4 chars with `PARTIAL` mask fully collapse to `***`

### 12.7 Idempotency Flow
1. Client sends `X-Idempotency-Key: <key>` (max 64 chars) on POST/PUT
2. **Key validation**: length > 64 → 400 `VALIDATION_ERROR`
3. **DB lookup** on `idempotency_records`:
   - **Replay**: row found, `responseBody` populated, not expired → return stored `statusCode` + `responseBody` immediately (no handler called)
   - **In-flight**: row found, `responseBody` null, not expired → 409 `CONFLICT` ("Request in progress")
   - **Not found** or expired: insert pending record, call handler, persist response on completion
4. `expiresAt = now + 24 hours`
5. Missing key → middleware is a no-op

### 12.8 Log Sanitization
Redacted field names (case-insensitive match on object keys):
`password`, `passwordHash`, `salt`, `token`, `secret`, `key`, `authorization`, `encryptedBalance`, `connectorConfig`, `aesKey`, `jwtSecret`

- All redacted values replaced with `"[REDACTED]"` before any transport or file write
- Applied **recursively** to nested objects
- String values containing `Bearer <token>` have the token portion replaced with `[REDACTED]`
- **No stack traces in API responses** — full stack logged internally, generic message returned to caller

### 12.9 Circuit Breaker State Machine
```
CLOSED → (failureCount >= threshold) → OPEN
OPEN   → (openTimeoutMs elapsed)     → HALF_OPEN (attempt one request)
HALF_OPEN → (success)                → CLOSED (reset counters)
HALF_OPEN → (failure)                → OPEN (record openedAt)
```
- `CircuitBreaker` class: configurable `failureThreshold`, `successThreshold`, `openTimeoutMs`
- `circuitBreakerRegistry`: singleton Map of name → instance (one per carrier connector)
- `getOrCreateBreaker(name, options)`: idempotent registry access
- `reset()`: admin-triggered force-close (used for manual override after connector maintenance)
- OPEN state throws `CircuitOpenError` (HTTP 503) immediately without calling downstream

### 12.10 Job Monitor Lifecycle
```
enqueueJob(type, payload, scheduledAt?) → BackgroundJob row (status=pending)
                    ↓
claimNextJob(type)  → atomic TX: findFirst(pending, ORDER BY scheduledAt) + update(running)
                    ↓
BaseWorker.handle(payload)
                    ↓
  ┌─────── success ────────┐    ┌──────── failure ───────────────────────┐
  │ markJobCompleted(id)   │    │ markJobFailed(id, errorMessage)        │
  │ status=completed        │    │ attempts++                             │
  │                         │    │ if attempts < maxAttempts: status=pending (retry)
  └─────────────────────────┘    │ else: status=failed                    │
                                  └────────────────────────────────────────┘
```
- `maxAttempts` cap prevents infinite retry loops
- `lastError` recorded for each failure for admin diagnostics
- Concrete workers: import, export, carrier sync, backup, log-retention, escalation-check

## 13. Requirement Traceability Table

| Domain | Frontend Module | Backend Module | Data Tables | Test Area |
|--------------|----------------|----------------|-------------|-----------|
| Classroom operations dashboard | `modules/dashboard/` | `modules/classroom-ops/` | classrooms, classroom_heartbeats, recognition_confidence_samples, anomaly_events, anomaly_acknowledgements, anomaly_assignments, anomaly_resolutions | Anomaly lifecycle, heartbeat freshness, confidence bounds |
| Parking operations | `modules/parking/` | `modules/parking/` | parking_facilities, parking_spaces, parking_readers, parking_events, parking_sessions, parking_exceptions, parking_escalations | 15-min escalation, exception closure, turnover calc |
| Shipping fee templates & zones | `modules/fulfillment/` | `modules/logistics/` | shipping_fee_templates, shipping_fee_surcharges, delivery_zones, non_serviceable_zips | Fee calculation, surcharge logic, ZIP validation |
| Warehouses, carriers, shipments | `modules/fulfillment/` | `modules/logistics/` | warehouses, carriers, shipments, parcels, tracking_updates, carrier_sync_cursors | Shipment lifecycle, tracking sync |
| After-sales ticketing | `modules/after-sales/` | `modules/after-sales/` | after_sales_tickets, ticket_timelines, evidence_assets, compensation_policies, compensation_suggestions, compensation_approvals | Compensation cap, SLA timers, evidence upload |
| Memberships & wallet | `modules/memberships/` | `modules/memberships/` | membership_tiers, members, growth_point_transactions, coupons, coupon_redemptions, member_pricing_rules, stored_value_wallets, wallet_ledger_entries, fulfillment_requests, fulfillment_line_items, printable_receipts | Pricing pipeline, wallet ledger integrity, coupon validation |
| Master data & import/export | `modules/admin/` | `modules/master-data/` | organizations, campuses, departments, courses, semesters, classes, students, class_enrollments, import_jobs, import_row_errors, export_jobs | Import validation, row errors, uniqueness enforcement |
| Auth & RBAC | `modules/admin/` | `modules/auth/` | users, roles, permissions, user_roles, role_permissions, login_attempts, security_events, field_masking_rules | Login flow, role enforcement, field masking |
| Observability | `modules/observability/` | `modules/observability/` | runtime_metrics, application_logs, alert_thresholds, alert_events, notification_events | Threshold evaluation, log retention, notification delivery |
| Configuration | `modules/admin/` | `modules/configuration/` | (app-level config stored in org settings or env) | Config validation, defaults |
| Backups & restore | `modules/admin/` | `modules/backups/` | backup_records, restore_runs | Backup lifecycle, retention, restore verification |
| File storage | (shared component) | `common/storage/` | file_assets, perceptual_hashes | Upload validation, perceptual hash dedup, size/type checks |
| Background jobs | (admin job monitor view) | `jobs/` | background_jobs | Job lifecycle, retry, status transitions |
| Idempotency | (transparent) | `common/middleware/` | idempotency_records | Key uniqueness, duplicate detection, expiry |

## 14. High-Risk Flow Sequences

### 14.1 Anomaly Resolution Flow
```
1. Classroom agent detects anomaly → POST /api/classroom-ops/anomalies
2. AnomalyEvent created with status=open
3. Operator acknowledges → POST /api/classroom-ops/anomalies/:id/acknowledge
   - Status → acknowledged
4. Operator assigns to supervisor → POST /api/classroom-ops/anomalies/:id/assign
   - Status → assigned
5. Assignee resolves → POST /api/classroom-ops/anomalies/:id/resolve
   - resolutionNote is REQUIRED (non-empty)
   - Status → resolved, resolvedAt set
```

### 14.2 Parking Exception Escalation
```
1. Parking event ingested → exception detected (e.g., no_plate, duplicate_plate)
2. ParkingException created with status=open, createdAt=now
3. Background escalation-check job runs periodically:
   - SELECT exceptions WHERE status=open AND createdAt < (now - 15 minutes)
   - For each: create ParkingEscalation, set exception status=escalated
   - Escalation targets supervisor queue based on facility assignment
4. Supervisor reviews escalated exception
5. Resolution requires resolutionNote (non-empty) → status=resolved
```

### 14.3 Fulfillment Pricing Pipeline
```
1. Fulfillment request submitted with line items, member ID, coupon code, shipping ZIP
2. Step 1: Calculate line item totals (unitPrice × quantity)
3. Step 2: Apply member pricing rules if member tier matches item category
4. Step 3: Validate and apply coupon (eligibility, expiry, tier restriction, min order)
5. Step 4: Look up shipping fee template by region (from ZIP → zone → regionCode) and tier
6. Step 5: Calculate shipping: baseFee + overage weight fee
7. Step 6: Apply regional surcharges (e.g., Alaska/Hawaii)
8. Step 7: If useWallet, apply wallet balance as payment (reduce finalAmount)
9. Final: totalAmount - discountAmount + shippingFee = finalAmount
10. Persist with idempotencyKey to prevent duplicate submissions
```

### 14.4 After-Sales Compensation Flow
```
1. Ticket created → auto-evaluate matching CompensationPolicies
2. For each matching policy: create CompensationSuggestion
   - suggestedAmount = min(policy.compensationAmount, remaining cap budget)
   - Cap budget = policy.maxCapPerTicket - sum(already approved on this ticket)
3. Customer Service Agent reviews suggestion
4. Approval: POST /api/after-sales/tickets/:id/compensations/:sid/approve
   - decision: approved or rejected
   - If approved and wallet enabled: credit wallet as refund ledger entry
5. Total approved compensation per ticket cannot exceed maxCapPerTicket ($50 default)
```

### 14.5 Import Validation & Error Reporting
```
1. User uploads Excel/CSV file for entity type (students, classes, etc.)
2. ImportJob created with status=pending
3. Background worker picks up job:
   a. Parse file rows
   b. Validate each row against entity schema + uniqueness constraints
   c. Valid rows: commit in batch transaction
   d. Invalid rows: record in ImportRowError with row number, field, message, raw value
4. ImportJob status updated: success (all valid), partial_success (some failed), failed (all failed)
5. Error report generated as downloadable file (linked via errorReportAssetId)
6. Job monitor shows import progress and final status
```

### 14.6 Wallet Top-Up / Spend with Ledger Integrity
```
Top-Up:
1. Validate: wallet enabled, amount > 0
2. Read current balance (decrypt)
3. Create WalletLedgerEntry: entryType=topup, balanceBefore=current, balanceAfter=current+amount
4. Update wallet encryptedBalance = encrypt(new balance)
5. Generate PrintableReceipt if requested

Spend:
1. Validate: wallet enabled, amount > 0, amount ≤ current balance
2. Read current balance (decrypt)
3. Create WalletLedgerEntry: entryType=spend, balanceBefore=current, balanceAfter=current-amount
4. Update wallet encryptedBalance = encrypt(new balance)
5. Link ledger entry to fulfillment request reference

Note: All balance operations must be serialized per wallet to prevent race conditions.
Ledger is append-only — no updates or deletes to WalletLedgerEntry rows.
```

## 15. Excel/CSV Import/Export Assumptions

### Import Templates
- One template per entity type (students, classes, departments, courses, semesters)
- First row is header row with expected column names
- Row-level validation: type checks, required fields, format validation, uniqueness
- Partial commit: valid rows committed, invalid rows rejected with error details
- Downloadable error report preserves source row numbers and field-level messages

### Export
- Timestamped filenames (e.g., `students_export_20260409_143022.xlsx`)
- Formats: XLSX and CSV
- Generated by background job, downloadable when complete
- Export includes all visible fields for the requesting user's role (respects field masking)

### Error Report Format
| Row | Field | Error | Raw Value |
|-----|-------|-------|-----------|
| 3 | studentNumber | Duplicate: already exists | STU-001 |
| 7 | email | Invalid email format | not-an-email |
| 12 | firstName | Required field is empty | |

## 13. Business Workflow Engine

### 13.1 Classroom Ops Flow

**Heartbeat → Status Update**
- Classroom agents POST `/api/classroom-ops/heartbeat` with `{ classroomId, metadata }`
- `upsertHeartbeat` transaction: creates `ClassroomHeartbeat` row + sets `classroom.status='online'` + `classroom.lastHeartbeatAt=now`
- If the classroom was previously offline for > 5 minutes (gap between old `lastHeartbeatAt` and now), `ingestHeartbeat` service automatically creates an `AnomalyEvent` of type `connectivity_loss` with severity `high`

**Confidence Sample → Anomaly Trigger**
| Confidence Value | Anomaly Type | Severity |
|-----------------|-------------|----------|
| `< 0.5` | `confidence_drop` | `high` |
| `>= 0.5` and `< 0.7` | `confidence_drop` | `medium` |
| `>= 0.7` | none | — |

**Anomaly Lifecycle State Machine**
```
open → acknowledged (POST .../acknowledge; ConflictError if already acknowledged)
open → assigned (POST .../assign)
acknowledged → assigned (POST .../assign)
open|acknowledged|assigned → resolved (POST .../resolve; resolutionNote required, non-empty)
```
- `resolveAnomaly` rejects if status is already `resolved` (UnprocessableError)
- `resolutionNote` must be a non-empty string — enforced at service layer + repository layer

### 13.2 Parking Ops Flow

**Event Ingestion → Session Assembly**
1. Reader type determines `entry` vs `exit`
2. `entry` + no plate: create event, create `no_plate` exception (at repo layer, in transaction)
3. `entry` + plate: check for existing active session with same plate in facility
   - Active session found → create `duplicate_plate` exception; no new session
   - No existing session → create new `ParkingSession` (status=active)
4. `exit` + plate: find active session with matching plate
   - Found → complete session (set `exitEventId`, `exitAt`, status=completed)
   - Not found → create `inconsistent_entry_exit` exception

**Exception Type Reference**
| Type | Trigger |
|------|---------|
| `no_plate` | Entry event with null or absent plateNumber |
| `duplicate_plate` | Entry event, but active session for same plate already exists |
| `inconsistent_entry_exit` | Exit event, but no active session matches the plate |
| `overtime` | Active session older than 4 hours threshold (worker-created) |

**15-Minute Escalation Rule**
- `isEscalationEligible(exception, now)` from `parking/types.ts`: returns true if `status='open'` AND `(now - createdAt) >= ESCALATION_THRESHOLD_MS (900_000 ms)`
- `escalation-check-worker` finds open exceptions, tests eligibility, creates `ParkingEscalation` row + updates `exception.status='escalated'`

### 13.3 Logistics Flow

**Warehouse / Carrier Config**
- Carriers store `connectorConfig` as AES-256-GCM encrypted JSON string at rest
- `createCarrier` encrypts before insert; `findCarrierById` decrypts on retrieval; `listCarriers` omits `connectorConfig` entirely (sensitive)

**Fee Calculation Formula** (implemented in `calculateShippingFee()` from `logistics/types.ts`)
```
fee = baseFee
if weight > baseWeightLb:
    fee += (weight - baseWeightLb) × perLbFee
for each surcharge where condition met:
    fee += surcharge.amount
```

**Shipment → Parcel → Tracking Hierarchy**
- `Shipment` contains one or more `Parcel` rows (created in transaction)
- `TrackingUpdate` rows are appended as status changes arrive (carrier API, manual entry)
- `shipment.deliveredAt` set when a tracking update with `status='delivered'` is recorded
- `FulfillmentRequest.idempotencyKey` is `@unique` at model level — service checks existence before creating

**Carrier Sync Cursor Pattern**
- One `CarrierSyncCursor` per carrier (unique on `carrierId`)
- `carrier-sync-worker` upserts cursor with `lastSyncAt=now` on every run
- For `manual` type: no-op; for `rest_api`/`file_drop`: worker executes connector sync and records tracking updates

### 13.4 After-Sales Flow

**Ticket Creation with SLA**
| Priority | SLA Deadline |
|----------|-------------|
| `urgent` | 4 hours |
| `high` | 8 hours |
| `medium` | 24 hours |
| `low` | 72 hours |

`slaDeadlineAt = createdAt + priorityHours`

**Evidence Upload**
- `POST /api/tickets/:id/evidence` with `{ fileAssetId, description? }` — file asset ID pre-generated by upload flow
- Creates `EvidenceAsset` row + appends `evidence_added` timeline entry in transaction
- Validates ticket exists and is not closed

**Compensation Suggestion Capping**
```
remainingBudget = max(0, maxCapPerTicket - approvedTotal)
cappedAmount = min(policyAmount, remainingBudget)
if cappedAmount > 0: create suggestion
else: return null (cap reached, no suggestion created)
```
- `capCompensation(amount, approvedTotal, cap)` from `after-sales/types.ts` computes final amount
- `approveCompensation` re-checks remaining budget before approving to prevent race-condition overpayment

**Ticket Type → Trigger Type Map**
| Ticket Type | Policy Trigger Type |
|-------------|-------------------|
| `delay` | `delivery_late_48h` |
| `lost_item` | `lost_item` |
| `dispute` | `damaged_item` |
| others | same as ticket type |

### 13.5 Memberships Flow

**Fulfillment Pricing Order**
1. Load member + tier (if `memberId` provided)
2. Apply member pricing per line item: `memberPrice = unitPrice × (1 - discountPercent/100)` matching `MemberPricingRule` by item category
3. Compute `totalAmount` = sum of `(memberPrice ?? unitPrice) × quantity`
4. Validate and apply coupon (if `couponCode` provided)
5. Add shipping fee (if ZIP + tier provided): check serviceability → look up template → `calculateShippingFee()`
6. `finalAmount = totalAmount - discountAmount + shippingFee`
7. Create `FulfillmentRequest` + line items (idempotency via `idempotencyKey @unique`)
8. Redeem coupon (increment counter)
9. Earn growth points: `floor(finalAmount)` points (1 pt per $1)
10. Check tier upgrade eligibility (`upgradeIfEligible`)
11. If `useWallet=true`: `spendFromWallet` up to `finalAmount`

**Coupon Validation Rules**
| Check | Failure Reason |
|-------|---------------|
| `isActive = false` | Coupon inactive |
| `expiresAt < now` | Coupon expired |
| `currentRedemptions >= maxRedemptions` | Max redemptions reached |
| `totalAmount < minOrderAmount` | Minimum order amount not met |
| Member tier not in eligible tiers | Tier not eligible |

**Wallet Ledger Append-Only Model**
- Every balance change = one new `WalletLedgerEntry` (no updates/deletes)
- `balanceBefore` and `balanceAfter` persisted at write time in transaction
- `encryptedBalance` in `StoredValueWallet` updated atomically in same transaction
- `entryType`: `TOPUP`, `SPEND`, `REFUND`

**Growth Points**
- Earned on fulfillment: 1 point per $1 of `finalAmount` (floored)
- Recorded via `addPointTransaction` which also increments `member.growthPoints`
- `upgradeIfEligible` checks `member.growthPoints >= nextTier.pointsThreshold` → if met, updates `member.tierId`

### 13.6 Import / Export

**Supported Entity Types**: `students`, `classes`, `departments`, `courses`, `semesters`

**Import Flow**
1. `POST /api/orgs/:orgId/import` → creates `ImportJob` (status=pending) → enqueues `import` background job → returns 202 with `{ importJobId, jobId }`
2. `import-worker` picks up job:
   - Sets `status='processing'`, `startedAt=now`
   - For each row: validates against entity schema (`createStudentSchema`, etc.)
   - Valid rows: upsert by natural key (e.g., `studentNumber`)
   - Invalid rows: create `ImportRowError` + collect `ImportRowValidationError[]`
3. If any errors: generate CSV correction report → create `FileAsset` → link via `errorReportAssetId`
4. Final status: `success` (0 failed), `partial_success` (some failed), `failed` (all failed)

**Export Flow**
1. `POST /api/orgs/:orgId/export` → creates `ExportJob` (status=pending) → enqueues `export` job → returns 202
2. `export-worker` fetches data, serializes to CSV, writes to `{STORAGE_PATH}/exports/{exportJobId}.csv`, creates `FileAsset`, links via `fileAssetId`

**Correction Report Format**

| Row | Field | Error | Raw Value |
|-----|-------|-------|-----------|
| 2 | firstName | Required | |
| 3 | email | Invalid email format | not-an-email |
| 4 | studentNumber | String must contain at most 50 character(s) | SSSSS... |

**Export File Path Pattern**: `{STORAGE_PATH}/exports/{exportJobId}.csv`
**Import Error Report Path Pattern**: `{STORAGE_PATH}/import-reports/{importJobId}.csv`

## 16. Entity Relationship Summary

- **Organization** → has many Campuses, Students, Semesters, Warehouses, Carriers, Zones, Templates, Tiers, Policies
- **Campus** → has many Departments, Classrooms, ParkingFacilities
- **Department** → has many Courses → has many Classes → has many ClassEnrollments → Student
- **Classroom** → has many Heartbeats, ConfidenceSamples, AnomalyEvents
- **AnomalyEvent** → has one Acknowledgement, one Assignment, one Resolution (required note)
- **ParkingFacility** → has many Spaces, Readers, Sessions, Exceptions
- **ParkingException** → may escalate to ParkingEscalation (15-min rule)
- **Warehouse** → ships Shipments → contains Parcels → referenced by AfterSalesTickets
- **Carrier** → handles Shipments, has SyncCursor, receives TrackingUpdates
- **ShippingFeeTemplate** → has Surcharges, matched by region+tier
- **AfterSalesTicket** → has Timeline, Evidence, CompensationSuggestions → CompensationApprovals
- **Member** → belongs to Tier, has PointTransactions, CouponRedemptions, Wallet, FulfillmentRequests
- **StoredValueWallet** → has append-only LedgerEntries (encrypted balance)
- **FulfillmentRequest** → has LineItems, CouponRedemptions, Receipts (idempotencyKey enforced)
- **FileAsset** → referenced by EvidenceAssets, ParkingEvents, Receipts, ImportJobs, ExportJobs
- **BackgroundJob** → tracks imports, exports, carrier sync, backups, maintenance tasks
- **BackupRecord** → has RestoreRuns with verification results

---

## §14 Frontend Architecture

### 14.1 App Bootstrap

`main.ts` wires Vue, Pinia, vue-router, and PrimeVue in that order. After Pinia is initialized, `registerTokenGetter()` is called to give the Axios client a function that reads the current auth token from the auth store. This avoids a circular import between the API client and Pinia.

```
main.ts
  → createPinia()        (state management)
  → createRouter()       (routing)
  → PrimeVue plugin      (component library)
  → registerTokenGetter  (wire auth token into axios)
  → app.mount('#app')
```

### 14.2 Route Map

| Route | Name | Auth | Guard |
|-------|------|------|-------|
| `/login` | `login` | No | Authenticated users redirect to dashboard |
| `/dashboard` | `dashboard` | Yes | Any authenticated user |
| `/classroom-ops` | `classroom-ops` | Yes | `read:classroom-ops:*` permission |
| `/parking` | `parking` | Yes | `read:parking:*` permission |
| `/fulfillment` | `fulfillment` | Yes | `read:logistics:*` permission |
| `/after-sales` | `after-sales` | Yes | `read:after-sales:*` permission |
| `/memberships` | `memberships` | Yes | `read:memberships:*` permission |
| `/admin` | `admin` | Yes | Administrator \| OpsManager \| Auditor role |
| `/observability` | `observability` | Yes | `read:observability:*` permission |
| `/forbidden` | `forbidden` | No | — |
| `/:pathMatch(.*)` | `not-found` | No | — |

Route meta fields: `requiresAuth`, `requiredPermission`, `requiredRoles`, `title`.

### 14.3 Navigation Guard (`auth.guard.ts`)

The `authGuard` runs before every navigation:

1. Authenticated user navigating to `/login` → redirect to `dashboard`
2. Route has `requiresAuth: true` and user is not authenticated → redirect to `login` with `?redirect=<path>`
3. Route has `requiredPermission` and user lacks it → redirect to `forbidden`
4. Route has `requiredRoles` and user has none of them → redirect to `forbidden`
5. Otherwise → `next()` (allow)

### 14.4 Layout System

Two layouts:
- **`AppLayout.vue`** — main shell with 220px collapsible sidebar, role-filtered navigation, notification toast stack, and `<RouterView>` main area
- **`AuthLayout.vue`** — minimal centered card for the login page

Navigation items in `AppLayout` are filtered at render time using `visibleNavItems` computed property, which checks `auth.hasPermission()` or `auth.hasAnyRole()` per item. Hardcoded role/permission checks do not exist outside this single computed property.

### 14.5 Pinia Store Boundaries

| Store | Responsibility |
|-------|----------------|
| `auth.store.ts` | JWT token (persisted to localStorage), user object, permissions array, `hasPermission()`, `hasAnyRole()` helpers |
| `ui.store.ts` | Notification queue (auto-dismissed after `life` ms), global loading flag |

Module-level reactive state (classroom-ops list, parking exception list, etc.) lives in the view components using `ref`/`reactive` with service adapter calls.

### 14.6 Typed API Client Layer

`services/api-client.ts` exports a configured Axios instance plus typed `get()`, `post()`, `patch()`, `del()` wrappers that unwrap `SuccessEnvelope<T>` responses. Error responses are normalized to `ApiError` by the response interceptor using the backend error code from the `error.code` field in the response body, falling back to HTTP status derivation.

Per-module service adapters (`auth.service.ts`, `classroom-ops.service.ts`, etc.) wrap the typed helpers with explicit request/response types, providing a single import point for each domain.

### 14.7 Shared UI Primitives

| Component | File | Purpose |
|-----------|------|---------|
| `KpiCard` | `components/shared/KpiCard.vue` | Metric card with label, value, optional sub-text and alert highlight |
| `AppDataTable` | `components/shared/AppDataTable.vue` | Searchable/filterable table wrapper; client-side text filter; empty state |
| `AppTimeline` | `components/shared/AppTimeline.vue` | Vertical timeline for ticket and anomaly lifecycle entries |
| `EmptyState` | `components/shared/EmptyState.vue` | Centered empty-set indicator with slot for CTA |
| `ErrorState` | `components/shared/ErrorState.vue` | Error indicator with optional retry callback, `role="alert"` |
| `LoadingSpinner` | `components/shared/LoadingSpinner.vue` | Animated spinner with aria-label, `role="status"` |
| `ActionBar` | `components/shared/ActionBar.vue` | Role-aware action button bar; filters actions via `auth.hasPermission`/`hasAnyRole` |
| `SidePanel` | `components/shared/SidePanel.vue` | Right-side slide-in panel using `<Teleport>` and `<Transition>` |

### 14.8 Real-time Update Strategy

Because the backend does not yet implement SSE or WebSocket endpoints, the frontend uses a **polling composable** (`utils/poll.ts`):

```typescript
const { data, error, isLoading, start, stop } = usePolling(fetchFn, {
  interval: 20_000,  // ms between fetches
  immediate: true,   // fetch immediately on start
});
```

- `onUnmounted` automatically calls `stop()` to prevent memory leaks
- Used in `DashboardView` (30s interval), `ClassroomOpsView` (20s), `ParkingView` (15s)
- If SSE is added, views can swap `usePolling` for `useEventSource` with the same data/error/isLoading contract

### 14.9 Idempotency Key Generation

`utils/idempotency.ts` exports `generateIdempotencyKey()` using `crypto.randomUUID()`. This produces a UUID v4 (36 chars) which is within the backend's 64-char `FulfillmentRequest.idempotencyKey` limit. Keys are generated at form open time so duplicate submits (double-click, slow network) send the same key and the backend deduplicates.

### 14.10 Export Filename Pattern

Export jobs produce files named `{exportJobId}.csv` server-side. The Admin view polls the export job until `status === 'completed'` and then presents a download link. A timestamped display filename is presented as `export_{entityType}_{YYYY-MM-DD}.csv` for user-facing display; the actual backend `fileAssetId` is used for the file fetch.

---

## §15 Primary User Workflows and Core Screens

### 15.1 Screen Map

| Route | Component | Primary Role(s) | Key Actions |
|-------|-----------|-----------------|-------------|
| `/dashboard` | `DashboardView` | All authenticated | Time-range toggle (Now/7d/30d), status filter, KPI cards (online/anomalies/offline/avg-confidence) |
| `/classroom-ops` | `ClassroomOpsView` | Supervisor, OpsManager, Admin | Severity+status filters, anomaly list, Acknowledge / Assign (SidePanel) / Resolve (requires note) |
| `/parking` | `ParkingView` | OpsManager, Admin, Auditor | Status+type filters, KPI row (open/escalated/due), Resolve (requires note), Escalate (OpsManager+ only) |
| `/fulfillment` | `FulfillmentView` | OpsManager, Admin | Status filter, Create Shipment panel (warehouse/carrier/parcels), Shipment Detail panel (tracking history + Add Update) |
| `/after-sales` | `AfterSalesView` | CSA, OpsManager, Admin, Auditor | Status+priority filters, Create Ticket panel, Ticket Detail (assign, suggest compensation, approve/reject, evidence, timeline, add note) |
| `/memberships` | `MembershipsView` | OpsManager, Admin, Auditor | Members/Tiers/Fulfillment tabs; member detail with wallet top-up/spend; fulfillment form with coupon + idempotency |
| `/admin` | `AdminView` | Admin, OpsManager, Auditor | Students/Import/Export tabs; import trigger + job polling; export trigger + download link |

### 15.2 Role-to-Workflow Matrix

| Role | Dashboard | Classroom Ops | Parking | Fulfillment | After-Sales | Memberships | Admin |
|------|-----------|---------------|---------|-------------|-------------|-------------|-------|
| Administrator | Read+Write | Read+Write | Read+Write+Escalate | Read+Write | Read+Write+Approve | Read+Write | Import+Export |
| OpsManager | Read+Write | Read+Write | Read+Write+Escalate | Read+Write | Read+Write+Approve | Read+Write | Import+Export |
| ClassroomSupervisor | Read | Read+Write | Read | — | — | — | — |
| CustomerServiceAgent | Read | Read | Read | Read | Read+Write | Read+Write | Read (Export) |
| Auditor | Read | Read | Read | Read | Read | **Read-only** (wallet ops hidden) | Read (Export only, Import disabled) |

### 15.3 Key State Transitions Surfaced in UI

**Anomaly lifecycle** (ClassroomOpsView):
```
open → acknowledged  (Acknowledge button; disabled if already acknowledged)
open/acknowledged → assigned  (Assign panel; requires assignedToUserId)
any non-resolved → resolved  (Resolve panel; resolutionNote required non-empty)
```
- `canWrite = auth.hasPermission('write:classroom-ops:*')` gates all write actions
- `actionInFlight` ref prevents concurrent double-click submits

**Parking exception lifecycle** (ParkingView):
```
open → escalated  (Escalate button; only OpsManager/Administrator; canEscalate computed)
open/escalated → resolved  (Resolve panel; resolutionNote required)
```
- `isEscalationEligible` (created > 15 min ago, status=open) renders `data-testid="escalation-due"` ⚠ indicator
- Due for Escalation KPI card alerts when `dueCount > 0`

**After-Sales compensation flow** (AfterSalesView):
```
ticket.status = open → suggest-compensation → pending_approval
pending_approval → approved/rejected  (only OpsManager/Administrator)
```
- SLA deadline coloring: `.sla-overdue` (past), `.sla-near` (within 4h), neutral (> 4h away)
- Compensation approve/reject buttons shown only when `canApprove = auth.hasAnyRole('OpsManager', 'Administrator')`

**Wallet operations** (MembershipsView):
```
top-up: wallet.balance += amount  (append WalletLedgerEntry, generate receipt)
spend: wallet.balance -= amount  (throws UnprocessableError if insufficient)
```
- Both operations use `generateIdempotencyKey()` called at submit time
- Wallet form entirely hidden for Auditors; `.readonly-notice` shown instead

**Fulfillment pricing pipeline** (MembershipsView Fulfillment tab):
```
lineItems → apply member pricing → apply coupon → add shipping → finalAmount
```
- `idempotencyKey` generated at submit time; second call with same key returns same result
- `fulfillResult` ref shown after success: subtotal / discount / shipping / total

**Import job lifecycle** (AdminView Import tab):
```
triggerImport() → { importJobId } → poll every 3s → status: pending|processing|partial_success|failed|success
```
- `errorReportAssetId` present on `partial_success`/`failed` → Download Error Report CSV link shown at `/api/files/{errorReportAssetId}`
- Import button disabled + readonly notice shown for Auditors

**Export job lifecycle** (AdminView Export tab):
```
triggerExport() → { exportJobId } → poll every 3s → status: pending|processing|completed|failed
```
- `fileAssetId` present on `completed` → Download link shown at `/api/files/{fileAssetId}` with `download` attribute
- Filename format: `export_{entityType}_{YYYY-MM-DD}.csv` (display name, not server path)

### 15.4 Shared Component Contracts

`AppDataTable` — slot-based column overrides let views inject custom badge/button renderers per field:
```html
<template #status="{ value }">
  <span :class="['badge', `badge--${value}`]">{{ value }}</span>
</template>
<template #actions="{ row }">
  <button @click="openDetail(row)">View</button>
</template>
```

`SidePanel` — `v-model` binding controls open/close; `#footer` slot renders action buttons:
```html
<SidePanel v-model="panelOpen" title="Resolve Exception">
  <!-- body slot -->
  <template #footer>
    <button @click="panelOpen = false">Cancel</button>
    <button @click="submit">Confirm</button>
  </template>
</SidePanel>
```

`AppTimeline` — used for shipment tracking history and after-sales ticket timeline:
```typescript
interface TimelineEntry { id: string; type: string; content: string; userId?: string; createdAt: string; }
```

### 15.5 Form Validation Rules (UI Layer)

| Screen | Field | Rule |
|--------|-------|------|
| ClassroomOps Resolve | resolutionNote | Required non-empty; enforced at form submit |
| Parking Resolve | resolutionNote | Required non-empty; enforced at form submit |
| After-Sales Create | type | Required; select must not be empty string |
| After-Sales Create | description | Required non-empty after trim |
| Fulfillment Create | warehouseId | Required |
| Fulfillment Create | carrierId | Required |
| Fulfillment Create | parcels | At least one; each parcel needs description |
| Memberships Fulfillment | lineItems | At least one; each item needs description and price > 0 |
| Memberships Create Member | tierId | Required |

---

## §16 Observability, Configuration, and Backup

### 16.1 Observability Architecture

The observability module collects system health signals from classroom agents and backend processes, evaluates them against configured thresholds, and surfaces alerts to operators.

**Metric ingestion** uses HMAC-signed endpoints (`X-Signature` + `X-Timestamp` headers verified with `verifySignature()` from `common/signing/api-signer.ts`). Internal agents do not hold JWT tokens; they authenticate via a shared signing secret derived from `JWT_SECRET`. The 5-minute timestamp window prevents replay attacks.

**Threshold evaluation** runs synchronously on every metric record:
```
recordMetric(name, value, unit)
  → insertMetric()
  → findActiveThresholdsForMetric(name)
  → for each threshold: evaluateThreshold(value, operator, threshold)
    → if triggered: createAlertEvent() + createNotification(type=BANNER)
```

`evaluateThreshold()` is a pure function in `observability/types.ts`:
| Operator | Condition |
|----------|-----------|
| `gt` | value > threshold |
| `gte` | value >= threshold |
| `lt` | value < threshold |
| `lte` | value <= threshold |
| `eq` | value === threshold |

**Supported metric names**: `p95_latency` (ms), `cpu_utilization` (%), `gpu_utilization` (%), `error_rate` (%).

**Log search**: `ApplicationLog` entries searchable by level, message substring, and date range. Log retention is enforced by the `log_retention` background job (deletes records older than 30 days).

**Frontend**: `ObservabilityView` has four tabs — Metrics (KPI cards), Logs (level+text filter, paginated table), Alerts (alert event list with acknowledge action, threshold creation panel for OpsManager+), Notifications (banner list with mark-read). Metric ingestion is backend-only (no direct UI ingestion).

### 16.2 Runtime Configuration

Runtime configuration provides a thin policy overlay over environment-derived defaults. It is stored in a process-scoped in-memory object and resets on process restart. For permanent policy changes, update the corresponding environment variable or Docker Compose env file.

**Adjustable fields**:
| Field | Default | Description |
|-------|---------|-------------|
| `heartbeatFreshnessSeconds` | 120 | Seconds before a classroom is considered offline |
| `storedValueEnabled` | false | Enables stored value wallets org-wide |
| `logRetentionDays` | 30 | Days before log purge |
| `parkingEscalationMinutes` | 15 | Minutes before open exception auto-escalates |

Non-adjustable fields (`storagePath`, `backupPath`, `backupRetentionDays`, `maxUploadSizeBytes`) come from environment variables and are read-only at runtime.

**Access**: GET `/api/config` — Administrator, OpsManager, Auditor. PATCH `/api/config` — Administrator only.

### 16.3 Backup and Restore

**Backup trigger**: `POST /api/backups` (Administrator only) creates a `BackupRecord` with `status='running'` and enqueues a `backup` job. The backup worker:
1. Creates directory at `{BACKUP_PATH}/{backupId}/`
2. Runs `mysqldump` using env-based credentials (`MYSQL_PWD`) and writes `dump.sql`
3. Writes `backup-meta.json` with timestamp and type information
4. Calls `deleteExpiredBackups()` to purge records older than 14 days
5. Updates `BackupRecord.status='completed'` with `sizeBytes` and `completedAt`

**Retention**: 14 days. `expiresAt = startedAt + 14 days`. The backup worker calls `deleteExpiredBackups()` on each run.

**Restore trigger**: `POST /api/backups/:id/restore` (Administrator only) validates the backup `status='completed'`, creates a `RestoreRun`, and enqueues a `restore` job. The restore worker:
1. Marks `RestoreRun.status='running'`
2. Verifies the backup directory and `dump.sql` exist
3. Restores the database from `dump.sql` via `mysql` CLI (env-based credentials)
4. Writes `verificationResult` JSON with restore details (including restored byte count)
5. Updates `RestoreRun.status='completed'` (or `'failed'` on error)

**Frontend**: Backups tab in `AdminView` — backup list with status badges, Trigger Backup button (Administrator only), Restore button on completed backups (Administrator only).

**Role access**: GET list/detail — Administrator, OpsManager, Auditor. POST trigger/restore — Administrator only.

---

## 17. Testing Architecture & Coverage

### 17.1 Test Suite Organization

The test corpus is organized into four independent suites runnable from `repo/run_tests.sh`:

| Suite | Location | Purpose |
|-------|----------|---------|
| Frontend unit/component | `frontend/unit_tests/` | Vue component rendering, role-gated UI, service adapter integration |
| Backend unit | `backend/unit_tests/` | Pure domain-logic functions with no DB or HTTP dependencies |
| Backend API contract | `backend/api_tests/` | HTTP-layer contracts using Supertest with mocked service/repository layers |
| Backend integration | `backend/integration_tests/` | DB-backed integration tests (real MySQL) for isolation and worker/API realism |

**Execution:**
```bash
./run_tests.sh              # all suites, no coverage
COVERAGE=true ./run_tests.sh  # all suites + coverage reports (*/coverage/)
```

### 17.2 Coverage Configuration

Coverage is collected by `@vitest/coverage-v8` and written to `*/coverage/`. Thresholds:

| Layer | Statements | Branches | Functions | Lines |
|-------|-----------|---------|-----------|-------|
| Backend | 80% | 70% | 80% | 80% |
| Frontend | 75% | 65% | 75% | 75% |

### 17.3 Critical Logic Areas and Test Strategy

**Domain rules tested as pure functions** (no DB/HTTP, deterministic):
- Anomaly status machine (`canAcknowledge`, `canAssign`, `canResolve`) — `unit_tests/anomaly-resolution.test.ts`
- Parking escalation eligibility (`isEscalationEligible`) — `unit_tests/parking-escalation.test.ts`
- Shipping fee formula (`calculateShippingFee`) — `unit_tests/shipping-fee-calculation.test.ts`
- Compensation capping (`capCompensation`, `remainingCompensationBudget`) — `unit_tests/compensation-rules.test.ts`
- SLA deadline by priority and breach/approaching detection — `unit_tests/sla-deadline.test.ts`
- Growth points earning and tier upgrade eligibility — `unit_tests/growth-points.test.ts`
- Coupon and member pricing rules — `unit_tests/coupon-member-pricing.test.ts`
- Wallet ledger arithmetic and append-only invariant — `unit_tests/wallet-ledger.test.ts`
- Import row validation (Zod against raw CSV rows) — `unit_tests/import-row-validation.test.ts`
- Job worker state transitions (claim/complete/fail lifecycle) — `unit_tests/job-worker-transitions.test.ts`
- Circuit breaker state machine (CLOSED/OPEN/HALF_OPEN) — `unit_tests/circuit-breaker.test.ts`

**Security primitives tested in isolation:**
- AES-256-GCM encrypt/decrypt and tamper detection — `unit_tests/aes256-encryption.test.ts`
- HMAC signing, verify, timestamp window — `unit_tests/api-signing.test.ts`
- bcrypt hash/verify — `unit_tests/password-hashing.test.ts`
- Field masking (FULL/PARTIAL/HASH, Administrator bypass) — `unit_tests/field-masking.test.ts`
- Log sanitization — `unit_tests/log-sanitization.test.ts`

**HTTP contracts tested via Supertest** in two layers: mocked API contract tests (`api_tests`) and DB-backed integration tests (`integration_tests`).

**Frontend components tested via @vue/test-utils** with Pinia stores, mocked service modules, and SidePanel/Teleport stubs.

### 17.4 Requirement Traceability

A full requirement-to-test mapping is maintained in `docs/test-traceability.md`. The document maps each requirement area and assertion to the exact test file responsible.

---

## §18 Deployment & Runtime Configuration

### 18.1 Container Topology

Three services are defined in `docker-compose.yml`:

| Service | Image | Port | Role |
|---------|-------|------|------|
| `mysql` | `mysql:8.0` | 3306 | Primary data store |
| `backend` | Node 18-alpine (built from `backend/Dockerfile`) | 4000 | Express API server (internal HTTPS) |
| `frontend` | nginx:alpine (built from `frontend/Dockerfile`) | 443 | TLS termination, SPA host, `/api` proxy |

Startup dependency chain: `backend` waits for the `mysql` healthcheck (`mysqladmin ping`) before starting. `frontend` waits for `backend` to be available. The `mysql` healthcheck polls every 10 seconds with a 5-retry limit.

### 18.2 Storage Volumes

Two named Docker volumes carry persistent data across container restarts:

| Volume | Container path | Env var | Purpose |
|--------|---------------|---------|---------|
| `object-storage` | `/data/object-storage` | `STORAGE_PATH` | File uploads (JPEG/PNG, import reports, export CSVs) |
| `backup-storage` | `/data/backups` | `BACKUP_PATH` | Daily MySQL dumps and backup metadata |

Both are declared in the `volumes:` block of `docker-compose.yml` and bind-mounted into the backend container. The frontend container mounts the TLS certificate directory (see §18.3).

### 18.3 TLS Configuration

TLS for LAN transport is enforced on both the browser-facing edge and the backend service. nginx listens on port 443, loads the mounted certificate and key, serves the compiled Vue SPA, and proxies all `/api/*` requests to the backend over HTTPS on the internal Docker network. The backend service is not browser-facing directly, but still serves HTTPS for in-cluster transport encryption.

Certificate wiring:
1. Obtain certificate and key files from the district CA or generate a self-signed pair.
2. Add a read-only bind mount to the frontend service in `docker-compose.yml`:
   ```yaml
   volumes:
     - /path/to/certs:/certs:ro
   ```
3. The `nginx.conf` in `frontend/nginx.conf` references the mounted paths:
   - `ssl_certificate     /certs/server.crt;`
   - `ssl_certificate_key /certs/server.key;`

The nginx configuration (`frontend/nginx.conf`) is copied into the image at build time. It defines three behaviors: HTTPS listener on port 443, `/api/` proxy to `https://backend:4000`, and SPA fallback (`try_files $uri $uri/ /index.html`).

### 18.4 Build Reproducibility

Both Dockerfiles use `npm ci` (not `npm install`) to ensure dependency versions are locked to `package-lock.json`. The backend Dockerfile build sequence is:

1. `npm ci` — install all dependencies including devDependencies (required for Prisma CLI and TypeScript compiler)
2. `npx prisma generate` — generate Prisma client from `prisma/schema.prisma`
3. `npm run build` — compile TypeScript to `dist/`
4. `npm prune --production` — strip devDependencies from the final image layer

This produces a lean production image while allowing the build tools to run during the intermediate steps.

### 18.5 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | Prisma MySQL connection string |
| `JWT_SECRET` | **Yes** | — | HMAC-SHA256 signing secret; minimum 1 character, recommend 64+ |
| `AES_KEY` | **Yes** | — | 32-byte key as 64 hex characters for AES-256-GCM |
| `PORT` | No | `4000` | Backend listen port |
| `JWT_EXPIRES_IN` | No | `8h` | JWT token lifetime |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt cost factor |
| `STORAGE_PATH` | No | `/data/object-storage` | Object storage root path |
| `BACKUP_PATH` | No | `/data/backups` | Backup storage root path |
| `TLS_CERT_PATH` | **Yes in production** | — | Path to TLS certificate file |
| `TLS_KEY_PATH` | **Yes in production** | — | Path to TLS private key file |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX` | No | `120` | Max requests per window per IP |
| `NODE_ENV` | No | `production` | Runtime mode |

Missing `DATABASE_URL`, `JWT_SECRET`, or `AES_KEY` causes an immediate startup error with a descriptive message listing each missing field. No silent defaults are used for any secret value.
When `NODE_ENV=production`, missing `TLS_CERT_PATH` or `TLS_KEY_PATH` also causes a startup error.

A `.env.example` file at the repository root documents every variable with example values and inline comments.
