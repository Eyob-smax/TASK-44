# CampusOps — Fulfillment & Operations Platform

Project type: fullstack

A full-stack offline-LAN web application for managing classroom operations and on-premise logistics fulfillment for devices, materials, and lost-and-found returns. Runs entirely on a disconnected local network — no internet dependency at runtime.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Vite |
| Component Library | PrimeVue |
| State Management | Pinia |
| HTTP Client | Axios |
| Backend | Express + TypeScript |
| ORM | Prisma |
| Validation | Zod |
| Database | MySQL 8.0 |
| Image Processing | Sharp |
| Excel/CSV | ExcelJS |
| PDF | PDFKit |
| Logging | Winston |
| Testing | Vitest |
| Containerization | Docker Compose |

## Repository Structure

```
repo/
├── README.md               ← this file
├── docker-compose.yml      ← service definitions
├── run_tests.sh            ← central test runner
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── unit_tests/         ← frontend unit/component tests (18 files)
│   └── src/
│       ├── app/            ← router, layouts (AppLayout, AuthLayout), guards, views (Login, Forbidden, NotFound)
│       ├── modules/        ← dashboard, classroom-ops, parking, fulfillment, after-sales, memberships, admin, observability
│       ├── components/     ← shared: KpiCard, AppDataTable, AppTimeline, EmptyState, ErrorState, LoadingSpinner, ActionBar, SidePanel
│       ├── stores/         ← auth.store (JWT+permissions), ui.store (notifications)
│       ├── services/       ← api-client (Axios), auth, classroom-ops, parking, logistics, after-sales, memberships, master-data, observability
│       └── utils/          ← permissions, idempotency, poll (usePolling composable)
└── backend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── prisma/
    │   └── schema.prisma   ← full domain model
    ├── database/
    │   ├── migrations/     ← raw SQL DDL migrations
    │   └── seeds/          ← reference data seeds (deferred)
    ├── unit_tests/         ← backend unit tests
    ├── api_tests/          ← backend API contract tests
    └── src/
        ├── app/            ← server bootstrap (config, container, server, index)
        ├── common/         ← middleware, errors, validation, encryption, logging, signing, circuit-breaker
        ├── modules/        ← auth, master-data, classroom-ops, parking, logistics, after-sales, memberships, observability, configuration, backups (all implemented)
        ├── jobs/           ← job monitor + BaseWorker + import/export/carrier-sync/escalation-check/log-retention/backup/restore workers
        └── integrations/   ← carrier connectors (deferred)
```

## Ports

| Service | Port |
|---------|------|
| Frontend (nginx — TLS termination + SPA + `/api` proxy) | **443** |
| Backend (Express — internal container HTTPS) | **4000** |
| MySQL | **3306** |

## Access URLs

- Frontend UI: `https://localhost` (port 443)
- Backend API base: `https://localhost/api`
- Internal backend container endpoint: `https://backend:4000` (container network only)

## Offline / LAN Constraints

- **No internet access required at runtime** — all services run on isolated LAN
- **No external email** — notifications are banner and audible workstation alerts only
- **No cloud storage** — all file assets stored on mounted local disk
- **No CDN** — frontend is served from nginx container
- **On-prem carrier connectors only** — no calls to external tracking APIs

## Local Disk Storage

Object storage is mounted at a configurable path (default: `/data/object-storage` in Docker).

- File uploads: JPEG and PNG only, 10 MB maximum per file
- Backups: written to a separate mount at `/data/backups`
- Both paths are declared as Docker volumes in `docker-compose.yml`

## TLS on LAN

TLS is required even on LAN. In production:
- Certificate material is provided by a district CA or admin-managed self-signed certs
- Backend reads cert paths from environment variables: `TLS_CERT_PATH`, `TLS_KEY_PATH`
- Development environments may use explicitly documented self-signed certificates
- The system fails clearly (startup error) when TLS is enabled but cert files are missing

See `docs/design.md` § 12 for full security boundary descriptions.

## Backup & Restore

- Daily full backups covering MySQL dump and object storage metadata
- 14-day retention — expired backups removed by background job
- Backup records tracked in database (`backup_records`, `restore_runs` tables)
- Restore procedure documented in `docs/design.md` § 11

## API Documentation

See `docs/api-spec.md` for full endpoint groups, request/response shapes, error codes, idempotency behavior, and file upload rules.

## Architecture Documentation

See `docs/design.md` for:
- System architecture and deployment model
- Frontend and backend module structure
- Domain entity relationships
- High-risk flow sequence descriptions (anomaly resolution, parking escalation, pricing pipeline, compensation, import validation, wallet operations)
- Requirement traceability table (prompt domain → frontend module → backend module → data tables → test areas)

## Required Environment Variables

| Variable | Required | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `DATABASE_URL` | **Yes** | — | Prisma MySQL connection string | `mysql://user:pass@mysql:3306/campusops` |
| `JWT_SECRET` | **Yes** | — | HMAC-SHA256 signing secret for JWTs | `your-64-char-secret` |
| `INTEGRATION_SIGNING_SECRET` | **Yes** | — | HMAC-SHA256 signing secret for internal integration endpoints | `your-32-char-secret` |
| `AES_KEY` | **Yes** | — | 32-byte key for AES-256-GCM, as 64-char hex | `a0b1c2d3...` (64 hex chars) |
| `PORT` | No | `4000` | Backend listen port | `4000` |
| `JWT_EXPIRES_IN` | No | `8h` | JWT token lifetime | `8h`, `1d` |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt cost factor | `12` |
| `STORAGE_PATH` | No | `/data/object-storage` | Object storage root path | `/data/object-storage` |
| `BACKUP_PATH` | No | `/data/backups` | Backup storage root path | `/data/backups` |
| `TLS_CERT_PATH` | **Yes in production** | — | Path to backend TLS certificate file | `/certs/server.crt` |
| `TLS_KEY_PATH` | **Yes in production** | — | Path to backend TLS private key file | `/certs/server.key` |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds | `60000` |
| `RATE_LIMIT_MAX` | No | `120` | Max requests per window per client | `120` |
| `NODE_ENV` | No | `production` | Runtime mode | `production`, `development` |

> **Missing `JWT_SECRET`, `INTEGRATION_SIGNING_SECRET`, or `AES_KEY` causes a startup error.** The server will not start with empty or missing security secrets. No silent defaults are ever used for secret values.

## Development Status

All primary user workflow screens are fully implemented with role-based access control, idempotent operations, SLA indicators, and typed service adapters.

### What exists now
- Full directory structure and repo contract
- All configuration files (`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, Dockerfiles, `.env.example`)
- Complete Prisma schema (`prisma/schema.prisma`) with all 40+ domain models
- SQL migration baseline (`database/migrations/001_initial_schema.sql`)
- TypeScript domain types and Zod validation schemas for all 10 backend modules
- Shared common validation schemas and error envelope types
- **App bootstrap**: `config.ts`, `container.ts`, `server.ts`, `index.ts`
- **Common infrastructure**: error classes, middleware (validation, auth, field masking, idempotency, rate limit, request ID), AES-256-GCM encryption, Winston logger, API signing, circuit breaker
- **Auth module**: full login/logout/me with JWT, bcrypt, lockout, RBAC
- **Job monitor**: `enqueueJob`, `claimNextJob`, `markJobCompleted`, `markJobFailed`; `BaseWorker` abstract class
- **Master Data module**: org/campus/student/department/course/semester/class CRUD, bulk import/export with background jobs
- **Classroom Ops module**: heartbeat ingestion + offline anomaly detection, confidence threshold anomaly creation, anomaly lifecycle (acknowledge/assign/resolve), classroom dashboard
- **Parking module**: event ingestion with session assembly, exception detection (no_plate, duplicate_plate, inconsistent_entry_exit, overtime), 15-minute escalation rule, exception resolution
- **Logistics module**: warehouse/carrier CRUD (carrier config AES-encrypted), delivery zones, non-serviceable ZIPs, shipping fee templates + surcharges, shipment + parcel creation, tracking updates, carrier sync cursor
- **After-Sales module**: ticket creation with SLA deadlines, evidence upload, timeline entries, compensation suggestion (policy-based capping), approval gate
- **Memberships module**: tier management, member creation, coupon validation + redemption, member pricing rules, stored value wallet (AES-encrypted balance, append-only ledger), fulfillment pricing pipeline, growth points, tier upgrades, receipt generation
- **Concrete job workers**: `import-worker`, `export-worker`, `carrier-sync-worker`, `escalation-check-worker`, `log-retention-worker`, `backup-worker`, `restore-worker`
- **Observability module**: runtime metric ingestion (HMAC-signed for internal agents), log search with level/date filters, configurable alert thresholds, alert event lifecycle (acknowledge), banner notifications, threshold auto-fire on metric ingestion via `evaluateThreshold()`
- **Configuration module**: runtime-adjustable policy overlay (heartbeat freshness, stored-value flag, escalation threshold, log retention); changes persist in memory until restart; env-sourced fields (storagePath, backupPath) are not overridable at runtime
- **Backups module**: trigger full backup (enqueues job, writes metadata JSON, purges expired records), trigger restore (enqueues job, runs structural verification), list backups and restore runs; 14-day retention enforced by backup worker
- **Backend unit tests** (51 files): anomaly resolution, parking exception/escalation, shipping fee, compensation rules, coupon/member pricing, growth points, wallet ledger, SLA deadline, import row validation, export metadata, job-worker transitions, backup retention, config validation, circuit breaker, AES-256 encryption, API signing, password hashing, field masking, log sanitization, idempotency middleware, enum validation, validation schemas, observability thresholds, shipping calculator, compensation cap, auth service, carrier-sync-worker (rest_api/file_drop/manual connectors), and more
- **Backend API tests** (26 files): contract tests plus DB-backed integration coverage for auth/RBAC, idempotency, classroom-ops, parking, logistics, after-sales, memberships, master-data, import/export, observability, config, backups, files access, error envelope and validation contracts
- **Frontend shell** (`src/app/`): vue-router with 9 routes, role/permission-based navigation guard, AppLayout + AuthLayout
- **Pinia stores**: `auth.store.ts` (JWT, user, permissions, localStorage persistence), `ui.store.ts` (notification queue)
- **Typed API client**: Axios instance with auth token injection, error normalization to `ApiError`, per-module typed service adapters (auth, classroom-ops, parking, logistics, after-sales, memberships, master-data)
- **Shared UI primitives**: `KpiCard`, `AppDataTable` (searchable/filterable), `AppTimeline`, `EmptyState`, `ErrorState`, `LoadingSpinner`, `ActionBar` (role-aware), `SidePanel`
- **Real-time update strategy**: `usePolling` composable (polling abstraction for LAN environment); Dashboard 30s, ClassroomOps 20s, Parking 15s
- **Idempotency**: `generateIdempotencyKey()` via `crypto.randomUUID()`, UUID v4 format
- **Module views**: 
  - `DashboardView` — time-range toggle (Now/7d/30d), status filter, 4 KPI cards (online/anomalies/offline/avg-confidence)
  - `ClassroomOpsView` — severity+status filters, Acknowledge / Assign (SidePanel) / Resolve panels; `canWrite` gating
  - `ParkingView` — 3 KPI cards, status+type filters, escalation indicators (`⚠ Due`), Resolve+Escalate panels
  - `FulfillmentView` — Create Shipment panel (warehouse/carrier/parcels/idempotency), Shipment Detail panel (parcels + tracking history + Add Tracking Update)
  - `AfterSalesView` — Create Ticket, Ticket Detail (assign/suggest-compensation/approve-reject/evidence/add-note/timeline), SLA deadline coloring (`.sla-overdue`, `.sla-near`)
  - `MembershipsView` — three tabs: Members (search, create, wallet top-up/spend with receipt), Tiers (read-only), Fulfillment (coupon+wallet+line-items+idempotency); Auditor wallet read-only enforcement
  - `AdminView` — five tabs: Students (search), Import (entity select, trigger, 3s job polling, error-report CSV download link), Export (entity select, trigger, 3s polling, timestamped CSV download link), Config (runtime policy controls with Administrator-only write gating), Backups (backup list with status badges, Trigger Backup, Restore buttons for completed backups)
  - `ObservabilityView` — four tabs: Metrics (4 KPI cards for p95 latency/CPU/GPU/error rate), Logs (level+text search, paginated table), Alerts (alert event list with acknowledge, threshold creation panel for OpsManager+), Notifications (banner list with mark-read)
- **Frontend unit tests** (19 files): auth guard, layout nav visibility, data table filtering, loading/error/empty states, idempotency key generation + duplicate-submit protection, idempotency header contract checks, API error normalization, polling composable, dashboard filters, fulfillment view, after-sales view, memberships view, admin view (Students/Import/Export), observability view, admin config+backups tabs, permissions helper, domain types, API error types
- **Docker assets**: `docker-compose.yml` (3-service stack), `backend/Dockerfile` (reproducible `npm ci` build with prisma generate + prune), `frontend/Dockerfile` (2-stage build; nginx serves SPA with TLS termination and `/api` proxy), `frontend/nginx.conf` (HTTPS listener on 443, `/api/` proxy to backend, SPA fallback)
- **Documentation**: `docs/design.md` §14 (Frontend Architecture), §15 (Primary User Workflows), §16 (Observability, Configuration, Backup), §17 (Testing Architecture & Coverage), §18 (Deployment & Runtime Configuration); `docs/api-spec.md` all endpoint groups; `docs/test-traceability.md` (full requirement-to-test mapping, 96 test files, requirement traceability across backend and frontend)

## Running Tests

Tests run inside Docker — no host-side Node.js installation required.

**Prerequisite:** Docker with the Compose plugin (`docker compose version` ≥ 2).

```bash
# All suites (from repo/ root):
./run_tests.sh

# All suites with coverage reports:
COVERAGE=true ./run_tests.sh
```

`run_tests.sh` provides disposable `docker run` examples for executing frontend
and backend tests without host-local `node_modules`.

Note: test-only Docker artifacts are intentionally removed from this repository.

Test locations:
- `frontend/unit_tests/`  — Vue component / utility tests (Vitest + @vue/test-utils)
- `backend/unit_tests/`   — Pure-logic domain rule tests (Vitest, no DB)
- `backend/api_tests/`    — HTTP contract tests and DB-backed integration tests (Vitest + Supertest)

Coverage reports are written to `frontend/coverage/index.html` and
`backend/coverage/index.html` when `COVERAGE=true`.

See `docs/test-traceability.md` for the full requirement-to-test mapping.

## Running the Application

> Docker startup is self-contained. Use `docker-compose up` for strict compatibility with acceptance checks. `docker compose up --build` is also supported for rebuild flows.

When ready:
```bash
# Copy the reference file and fill in real values:
cp .env.example .env

# From repo/ root:
docker-compose up

# Optional rebuild path:
docker compose up --build
```

Windows PowerShell equivalent for the copy step:
```powershell
Copy-Item .env.example .env
```

Required environment variables (see `.env.example` for the full reference):
- `DATABASE_URL`, `JWT_SECRET`, `INTEGRATION_SIGNING_SECRET`, `AES_KEY`
- `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` — MySQL service credentials

For local Docker runs, `docker-compose.yml` includes safe non-empty fallback values
for `JWT_SECRET`, `INTEGRATION_SIGNING_SECRET`, and `AES_KEY` so the backend can
start on a clean checkout. Always override these defaults in real deployments.

TLS (required for LAN use): the Compose `cert-init` service ensures `server.crt`
and `server.key` exist under `${CERT_PATH:-./certs}` before backend/frontend
startup. If files already exist, they are reused. To pre-generate your own
self-signed certificate for LAN use:
```bash
mkdir -p ./certs
openssl req -x509 -newkey rsa:4096 -keyout certs/server.key -out certs/server.crt \
        -days 3650 -nodes -subj "/CN=campusops-lan"
```

### Docker-contained bootstrap (automatic, no manual DB setup)

`docker compose up --build` automatically runs idempotent RBAC + demo-user seeds in a one-shot `db-seed` container before the backend starts.

Notes:
- `001_rbac_seed.sql` and `003_demo_users_seed.sql` are executed by the `db-seed` service.
- Seeds are idempotent (`INSERT IGNORE`), so repeated startups are safe.
- `002_bootstrap_admin.sql.example` remains available for custom one-off operator bootstrap flows.

## Demo Credentials

Authentication is required.

All demo users in `003_demo_users_seed.sql` use the same password:
- Password: `password`

| Role | Username |
|------|----------|
| Administrator | `demo.admin` |
| OpsManager | `demo.ops` |
| ClassroomSupervisor | `demo.classroom` |
| CustomerServiceAgent | `demo.cs` |
| Auditor | `demo.auditor` |
| Viewer | `demo.viewer` |

## Verification (Smoke Checks)

After stack startup and seed bootstrap, verify the system with these checks.

### 1) Login and token retrieval (API)

```bash
curl -k -s https://localhost/api/auth/login \
        -H 'Content-Type: application/json' \
        -H 'X-Idempotency-Key: smoke-login-001' \
        -d '{"username":"demo.admin","password":"password"}'
```

Expected:
- HTTP 200
- JSON contains `success: true`
- JSON contains `data.token`

### 2) Authenticated profile call

```bash
TOKEN="<paste_token_from_login>"
curl -k -s https://localhost/api/auth/me -H "Authorization: Bearer $TOKEN"
```

Expected:
- HTTP 200
- `data.username` equals `demo.admin`

### 3) Frontend access

Open `https://localhost` in a browser and sign in with any demo user.

Expected:
- Login succeeds.
- Navigation and visible modules change by role (for example, Viewer is read-only and cannot perform write actions).

## Troubleshooting Restart Loops

If `docker compose up --build` shows repeated frontend/backend restarts:

- Frontend TLS error (`SSL_CTX_use_PrivateKey ... key values mismatch`):
        - The Compose `cert-init` service now validates cert/key modulus and regenerates
                `server.crt` + `server.key` when they are invalid or mismatched.

- Backend Prisma error (`Incorrect datetime value: '0000-00-00 00:00:00.000'`):
        - The Compose backend startup now retries schema sync with
                `prisma db push --force-reset` when initial `db push` fails.
        - This local recovery behavior is controlled by
                `PRISMA_FORCE_RESET_ON_PUSH_FAILURE` (default: `true`).

If you want a fully clean local reset, run:

```bash
docker compose down -v --remove-orphans
docker compose up --build
```

## questions.md

Blocker-level architectural ambiguities are documented in `../questions.md` at the project root.

## Codespaces Access Notes

When running in GitHub Codespaces, open the forwarded port `443` URL from the
Ports panel (for example: `https://<codespace-name>-443.app.github.dev`).

If you see a 502 in Codespaces, check service health first:

```bash
docker compose ps
docker compose logs --tail=120 backend frontend mysql
```

Expected healthy state:
- `backend` is `Up` and logs include `CampusOps backend listening with HTTPS on port 4000`
- `frontend` is `Up` and serves `GET /login` with HTTP 200
