# Test Coverage Audit

## Scope and Method
- Audit mode: static inspection only (no execution).
- Files inspected (targeted):
  - backend route mounts and route modules:
    - `repo/backend/src/app/server.ts`
    - `repo/backend/src/modules/*/routes.ts`
  - backend API tests and integration tests:
    - `repo/backend/api_tests/*.test.ts`
    - `repo/backend/api_tests/integration/*.integration.test.ts`
  - backend unit tests:
    - `repo/backend/unit_tests/*.test.ts`
  - frontend unit tests and framework evidence:
    - `repo/frontend/unit_tests/*.test.ts`
    - `repo/frontend/package.json`
  - docs/runtime checks:
    - `repo/README.md`
    - `repo/run_tests.sh`

## Project Type Detection
- Declared at README top: `Project type: fullstack` (`repo/README.md`).
- Light structure verification matches declaration:
  - `repo/backend`
  - `repo/frontend`
- Effective type used for strict checks: **fullstack**.

## Strict Endpoint Inventory (METHOD + fully resolved PATH)
Resolved from mount prefixes in `repo/backend/src/app/server.ts` and route declarations in each module `routes.ts`.

Total unique endpoints: **90**

### Auth/Admin (4)
1. POST /api/auth/login
2. POST /api/auth/logout
3. GET /api/auth/me
4. POST /api/admin/users

### Master Data (17)
1. GET /api/orgs
2. GET /api/orgs/:orgId
3. GET /api/orgs/:orgId/campuses
4. GET /api/orgs/:orgId/students
5. POST /api/orgs/:orgId/students
6. GET /api/orgs/:orgId/students/:id
7. PATCH /api/orgs/:orgId/students/:id
8. GET /api/orgs/:orgId/departments
9. POST /api/orgs/:orgId/departments
10. POST /api/orgs/:orgId/courses
11. GET /api/orgs/:orgId/semesters
12. POST /api/orgs/:orgId/semesters
13. POST /api/orgs/:orgId/classes
14. POST /api/orgs/:orgId/import
15. GET /api/orgs/:orgId/import/:id
16. POST /api/orgs/:orgId/export
17. GET /api/orgs/:orgId/export/:id

### Classroom Ops (9)
1. POST /api/classroom-ops/heartbeat
2. POST /api/classroom-ops/confidence
3. POST /api/classroom-ops/anomalies
4. GET /api/classroom-ops/anomalies
5. GET /api/classroom-ops/anomalies/:id
6. POST /api/classroom-ops/anomalies/:id/acknowledge
7. POST /api/classroom-ops/anomalies/:id/assign
8. POST /api/classroom-ops/anomalies/:id/resolve
9. GET /api/classroom-ops/dashboard

### Parking (7)
1. POST /api/parking/events
2. GET /api/parking/facilities
3. GET /api/parking/facilities/:id/status
4. GET /api/parking/exceptions
5. GET /api/parking/exceptions/:id
6. POST /api/parking/exceptions/:id/resolve
7. POST /api/parking/exceptions/:id/escalate

### Logistics (13)
1. GET /api/orgs/:orgId/warehouses
2. POST /api/orgs/:orgId/warehouses
3. GET /api/orgs/:orgId/carriers
4. POST /api/orgs/:orgId/carriers
5. GET /api/orgs/:orgId/shipping-fee-templates
6. POST /api/orgs/:orgId/shipping-fee-templates
7. GET /api/orgs/:orgId/shipping-fee-templates/calculate
8. POST /api/orgs/:orgId/delivery-zones
9. POST /api/orgs/:orgId/non-serviceable-zips
10. GET /api/orgs/:orgId/shipments
11. POST /api/shipments
12. GET /api/shipments/:id
13. POST /api/shipments/:id/tracking

### After-Sales (9)
1. POST /api/orgs/:orgId/tickets
2. GET /api/orgs/:orgId/tickets
3. GET /api/tickets/:id
4. POST /api/tickets/:id/timeline
5. POST /api/tickets/:id/assign
6. POST /api/tickets/:id/status
7. POST /api/tickets/:id/evidence
8. POST /api/tickets/:id/suggest-compensation
9. POST /api/tickets/:id/compensations/:suggestionId/approve

### Memberships (11)
1. POST /api/orgs/:orgId/membership-tiers
2. GET /api/orgs/:orgId/membership-tiers
3. GET /api/orgs/:orgId/members
4. POST /api/orgs/:orgId/members
5. POST /api/orgs/:orgId/coupons
6. POST /api/orgs/:orgId/fulfillments
7. GET /api/members/:id
8. GET /api/members/:id/wallet
9. POST /api/members/:id/wallet/topup
10. POST /api/members/:id/wallet/spend
11. GET /api/members/fulfillments/:id

### Observability (11)
1. GET /api/observability/metrics
2. POST /api/observability/metrics
3. GET /api/observability/logs
4. GET /api/observability/thresholds
5. POST /api/observability/thresholds
6. PATCH /api/observability/thresholds/:id
7. DELETE /api/observability/thresholds/:id
8. GET /api/observability/alerts
9. POST /api/observability/alerts/:id/acknowledge
10. GET /api/observability/notifications
11. POST /api/observability/notifications/:id/read

### Configuration (2)
1. GET /api/config
2. PATCH /api/config

### Backups (5)
1. GET /api/backups
2. POST /api/backups
3. GET /api/backups/restore-runs/all
4. GET /api/backups/:id
5. POST /api/backups/:id/restore

### Files (2)
1. POST /api/files
2. GET /api/files/:id

## API Test Classification (all backend API tests)
Classification rule:
- True no-mock HTTP: request via `supertest` against real `createApp()` path and no mock/stub markers in file.
- HTTP with mocking: `supertest` present but file contains mock/stub markers.
- Non-HTTP: no endpoint request path assertions.

### 1) True no-mock HTTP
- `repo/backend/api_tests/full-app-no-mock.api.test.ts`
- `repo/backend/api_tests/integration/auth-admin-no-mock.integration.test.ts`
- `repo/backend/api_tests/integration/full-app-handler-reach.integration.test.ts`
- `repo/backend/api_tests/integration/full-app-happy-path-read.integration.test.ts`
- `repo/backend/api_tests/integration/full-app-semantic-no-mock.integration.test.ts`
- `repo/backend/api_tests/integration/full-app-validation-reach.integration.test.ts`
- `repo/backend/api_tests/integration/master-data-write-handler-reach.integration.test.ts`
- `repo/backend/api_tests/integration/classroom-parking-write-handler-reach.integration.test.ts`
- `repo/backend/api_tests/integration/logistics-write-no-mock.integration.test.ts`
- `repo/backend/api_tests/integration/logistics-shipping-fee-calculate.integration.test.ts`
- `repo/backend/api_tests/integration/logistics-shipments.integration.test.ts`
- `repo/backend/api_tests/integration/logistics-memberships-api.integration.test.ts`
- `repo/backend/api_tests/integration/after-sales-write-handler-reach.integration.test.ts`
- `repo/backend/api_tests/integration/after-sales-tickets.integration.test.ts`
- `repo/backend/api_tests/integration/memberships-write-wallet-no-mock.integration.test.ts`
- `repo/backend/api_tests/integration/memberships-fulfillment.integration.test.ts`
- `repo/backend/api_tests/integration/observability-write-handler-reach.integration.test.ts`
- `repo/backend/api_tests/integration/config-api.integration.test.ts`
- `repo/backend/api_tests/integration/backups-write-handler-reach.integration.test.ts`
- `repo/backend/api_tests/integration/files-upload.integration.test.ts`

### 2) HTTP with mocking
- `repo/backend/api_tests/after-sales.api.test.ts`
- `repo/backend/api_tests/auth.api.test.ts`
- `repo/backend/api_tests/backups.api.test.ts`
- `repo/backend/api_tests/classroom-ops.api.test.ts`
- `repo/backend/api_tests/config.api.test.ts`
- `repo/backend/api_tests/files.api.test.ts`
- `repo/backend/api_tests/idempotency.api.test.ts`
- `repo/backend/api_tests/import-export.api.test.ts`
- `repo/backend/api_tests/logistics.api.test.ts`
- `repo/backend/api_tests/master-data.api.test.ts`
- `repo/backend/api_tests/master-data-orgs.api.test.ts`
- `repo/backend/api_tests/memberships.api.test.ts`
- `repo/backend/api_tests/observability.api.test.ts`
- `repo/backend/api_tests/parking.api.test.ts`
- `repo/backend/api_tests/rbac.api.test.ts`

### 3) Non-HTTP (unit/contract/integration without HTTP request path assertions)
- `repo/backend/api_tests/error-envelope.contract.test.ts`
- `repo/backend/api_tests/validation-errors.contract.test.ts`
- `repo/backend/api_tests/integration/alert-threshold-isolation.integration.test.ts`
- `repo/backend/api_tests/integration/observability-isolation.integration.test.ts`
- `repo/backend/api_tests/integration/backup-restore.integration.test.ts`

## Mock Detection (strict)
Detected mocking markers (`vi.mock`) in HTTP API test files:
- `repo/backend/api_tests/after-sales.api.test.ts`: mocks service/repository/container/idempotency middleware.
- `repo/backend/api_tests/auth.api.test.ts`: mocks auth service and repository.
- `repo/backend/api_tests/backups.api.test.ts`: mocks backups service and idempotency middleware.
- `repo/backend/api_tests/classroom-ops.api.test.ts`: mocks service/repository/container/idempotency middleware.
- `repo/backend/api_tests/config.api.test.ts`: mocks configuration service.
- `repo/backend/api_tests/files.api.test.ts`: mocks `sharp` and app container db.
- `repo/backend/api_tests/idempotency.api.test.ts`: mocks app container and auth service.
- `repo/backend/api_tests/import-export.api.test.ts`: mocks repository/service/job-monitor/container/idempotency.
- `repo/backend/api_tests/logistics.api.test.ts`: mocks logistics service/repository/idempotency.
- `repo/backend/api_tests/master-data.api.test.ts`: mocks repository/service/container/idempotency.
- `repo/backend/api_tests/master-data-orgs.api.test.ts`: mocks master-data repository.
- `repo/backend/api_tests/memberships.api.test.ts`: mocks memberships service/repository/container/encryption/idempotency.
- `repo/backend/api_tests/observability.api.test.ts`: mocks observability service.
- `repo/backend/api_tests/parking.api.test.ts`: mocks parking service/repository/container/idempotency.
- `repo/backend/api_tests/rbac.api.test.ts`: mocks auth repository.

No mock markers found in:
- `repo/backend/api_tests/integration/*.integration.test.ts`
- `repo/backend/api_tests/full-app-no-mock.api.test.ts`

## API Test Mapping Table
Rule used for mapping: endpoint is considered covered only when exact METHOD+PATH is requested in HTTP test and route handler stack is reached. Evidence references include concrete test names.

| Endpoint | Covered | Test type | Test files | Evidence |
|---|---|---|---|---|
| POST /api/auth/login | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; auth-admin-no-mock.integration.test.ts | `POST /api/auth/login returns validation error when required fields are missing`; `POST /api/auth/login returns token from real auth service and repository` |
| POST /api/auth/logout | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; auth-admin-no-mock.integration.test.ts | `noAuthCases` loop includes `/api/auth/logout`; `POST /api/auth/logout records logout flow without mocks` |
| GET /api/auth/me | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; auth-admin-no-mock.integration.test.ts | `noAuthCases` loop includes `/api/auth/me`; `GET /api/auth/me returns current user from real repository path` |
| POST /api/admin/users | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; auth-admin-no-mock.integration.test.ts | `noAuthCases` loop includes `/api/admin/users`; `POST /api/admin/users creates a non-admin user with org assignment` |
| GET /api/orgs | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | `noAuthCases` loop includes `/api/orgs`; `GET org and campus endpoints reach handlers` |
| GET /api/orgs/:orgId | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | `noAuthCases` loop includes `/api/orgs/org-1`; `GET org and campus endpoints reach handlers` |
| GET /api/orgs/:orgId/campuses | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | `noAuthCases` loop includes `/api/orgs/org-1/campuses`; `GET org and campus endpoints reach handlers` |
| GET /api/orgs/:orgId/students | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | `noAuthCases` loop includes `/api/orgs/org-1/students`; `creates and reads student via HTTP handlers` |
| POST /api/orgs/:orgId/students | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | `noAuthCases` loop includes POST students; `creates and reads student via HTTP handlers` |
| GET /api/orgs/:orgId/students/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts; full-app-handler-reach.integration.test.ts | `noAuthCases` includes students/:id; `creates and reads student via HTTP handlers`; `reaches master-data handler` |
| PATCH /api/orgs/:orgId/students/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | `noAuthCases` includes PATCH students/:id; `creates and reads student via HTTP handlers` |
| GET /api/orgs/:orgId/departments | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | `noAuthCases` includes departments; `creates department, course, semester, and class via HTTP handlers` |
| POST /api/orgs/:orgId/departments | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/courses | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/orgs/:orgId/semesters | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/semesters | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/classes | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/import | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | `noAuthCases` includes import; `import/export handlers are reached without mocks` |
| GET /api/orgs/:orgId/import/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/export | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/orgs/:orgId/export/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; master-data-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/classroom-ops/heartbeat | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | `noAuthCases` includes heartbeat; `covers classroom-ops handlers without mocks` |
| POST /api/classroom-ops/confidence | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/classroom-ops/anomalies | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/classroom-ops/anomalies | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/classroom-ops/anomalies/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts; full-app-handler-reach.integration.test.ts | `noAuthCases` includes anomalies/:id; `covers classroom-ops handlers`; `reaches classroom-ops handler` |
| POST /api/classroom-ops/anomalies/:id/acknowledge | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | `noAuthCases` includes acknowledge; `covers classroom-ops handlers` |
| POST /api/classroom-ops/anomalies/:id/assign | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/classroom-ops/anomalies/:id/resolve | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/classroom-ops/dashboard | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/parking/events | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | `noAuthCases` includes parking events; `covers parking handlers without mocks` |
| GET /api/parking/facilities | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/parking/facilities/:id/status | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/parking/exceptions | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/parking/exceptions/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts; full-app-handler-reach.integration.test.ts | same + `reaches parking handler` |
| POST /api/parking/exceptions/:id/resolve | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| POST /api/parking/exceptions/:id/escalate | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; classroom-parking-write-handler-reach.integration.test.ts | same evidence block |
| GET /api/orgs/:orgId/warehouses | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-write-no-mock.integration.test.ts | `noAuthCases` includes warehouses; `covers org-scoped logistics write handlers with real repository path` |
| POST /api/orgs/:orgId/warehouses | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-write-no-mock.integration.test.ts | same evidence block |
| GET /api/orgs/:orgId/carriers | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-write-no-mock.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/carriers | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-write-no-mock.integration.test.ts | same evidence block |
| GET /api/orgs/:orgId/shipping-fee-templates | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-write-no-mock.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/shipping-fee-templates | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-write-no-mock.integration.test.ts | same evidence block |
| GET /api/orgs/:orgId/shipping-fee-templates/calculate | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-shipping-fee-calculate.integration.test.ts | `noAuthCases` includes calculate; `GET .../calculate returns computed fee` |
| POST /api/orgs/:orgId/delivery-zones | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-write-no-mock.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/non-serviceable-zips | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-write-no-mock.integration.test.ts | same evidence block |
| GET /api/orgs/:orgId/shipments | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-memberships-api.integration.test.ts | `noAuthCases` includes org shipments; `lists only same-org shipments via real DB-backed API path` |
| POST /api/shipments | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-shipments.integration.test.ts | `noAuthCases` includes POST /api/shipments; `creates a shipment once and replays the same response` |
| GET /api/shipments/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-shipments.integration.test.ts; full-app-handler-reach.integration.test.ts | `noAuthCases` includes shipments/:id; `hides cross-org shipments`; `reaches logistics shipment handler` |
| POST /api/shipments/:id/tracking | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-shipments.integration.test.ts | `noAuthCases` includes tracking; `records tracking update and transitions shipment state` |
| POST /api/orgs/:orgId/tickets | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts | `noAuthCases` includes create ticket; `covers org-scoped create/list ticket handlers` |
| GET /api/orgs/:orgId/tickets | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts; after-sales-tickets.integration.test.ts | `noAuthCases` includes list tickets; list and org-isolation tests |
| GET /api/tickets/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts; full-app-handler-reach.integration.test.ts | `noAuthCases` includes ticket detail; `covers ticket-scoped handlers`; `reaches after-sales ticket handler` |
| POST /api/tickets/:id/timeline | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts | same ticket-scoped handlers block |
| POST /api/tickets/:id/assign | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts | same ticket-scoped handlers block |
| POST /api/tickets/:id/status | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts | same ticket-scoped handlers block |
| POST /api/tickets/:id/evidence | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts | same ticket-scoped handlers block |
| POST /api/tickets/:id/suggest-compensation | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts | same ticket-scoped handlers block |
| POST /api/tickets/:id/compensations/:suggestionId/approve | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; after-sales-write-handler-reach.integration.test.ts | same ticket-scoped handlers block |
| POST /api/orgs/:orgId/membership-tiers | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; memberships-write-wallet-no-mock.integration.test.ts | `noAuthCases` includes membership-tiers POST; `covers tier/member/coupon creation...` |
| GET /api/orgs/:orgId/membership-tiers | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-happy-path-read.integration.test.ts | `noAuthCases` includes membership-tiers GET; `GET ${tc.path} returns 200` readCases |
| GET /api/orgs/:orgId/members | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; logistics-memberships-api.integration.test.ts | `noAuthCases` includes members list; `lists only same-org members via real DB-backed API path` |
| POST /api/orgs/:orgId/members | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; memberships-write-wallet-no-mock.integration.test.ts | `noAuthCases` includes members POST; `covers tier/member/coupon creation...` |
| POST /api/orgs/:orgId/coupons | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; memberships-write-wallet-no-mock.integration.test.ts | same evidence block |
| POST /api/orgs/:orgId/fulfillments | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; memberships-fulfillment.integration.test.ts | `noAuthCases` includes fulfillments POST; `creates fulfillment once and replays...` |
| GET /api/members/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-handler-reach.integration.test.ts | `noAuthCases` includes member detail; `reaches memberships handler` |
| GET /api/members/:id/wallet | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; memberships-write-wallet-no-mock.integration.test.ts | `noAuthCases` includes wallet GET; wallet read-write handler block |
| POST /api/members/:id/wallet/topup | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; memberships-write-wallet-no-mock.integration.test.ts | top-up evidence in wallet block |
| POST /api/members/:id/wallet/spend | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; memberships-write-wallet-no-mock.integration.test.ts | spend evidence in wallet block |
| GET /api/members/fulfillments/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; memberships-fulfillment.integration.test.ts; full-app-handler-reach.integration.test.ts | `noAuthCases` includes fulfillment detail; same-org/cross-org detail tests; reach test |
| GET /api/observability/metrics | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-happy-path-read.integration.test.ts | `noAuthCases` includes observability metrics GET; happy-path read case |
| POST /api/observability/metrics | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; observability-write-handler-reach.integration.test.ts | `noAuthCases` includes metrics POST; `POST /metrics accepts valid signed requests without mocks` |
| GET /api/observability/logs | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-happy-path-read.integration.test.ts | `noAuthCases` includes logs GET; happy-path read case |
| GET /api/observability/thresholds | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-handler-reach.integration.test.ts; full-app-happy-path-read.integration.test.ts | noAuth + reach + read-case evidence |
| POST /api/observability/thresholds | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; observability-write-handler-reach.integration.test.ts | noAuth + threshold write handlers reached |
| PATCH /api/observability/thresholds/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; observability-write-handler-reach.integration.test.ts | noAuth + threshold patch reached |
| DELETE /api/observability/thresholds/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; observability-write-handler-reach.integration.test.ts | noAuth + threshold delete reached |
| GET /api/observability/alerts | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-happy-path-read.integration.test.ts | noAuth + happy-path read case |
| POST /api/observability/alerts/:id/acknowledge | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; observability-write-handler-reach.integration.test.ts | noAuth + alert ack handler reached |
| GET /api/observability/notifications | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-happy-path-read.integration.test.ts | noAuth + happy-path read case |
| POST /api/observability/notifications/:id/read | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; observability-write-handler-reach.integration.test.ts | noAuth + notification read handler reached |
| GET /api/config | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; config-api.integration.test.ts; full-app-handler-reach.integration.test.ts | `GET /api/config returns semantic runtime config envelope`; `GET /api/config returns current config envelope`; `reaches runtime configuration handler` |
| PATCH /api/config | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; config-api.integration.test.ts | `PATCH /api/config persists and reflects policy updates`; `PATCH /api/config updates runtime config for Administrator` |
| GET /api/backups | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-happy-path-read.integration.test.ts | noAuth + happy-path read case |
| POST /api/backups | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; backups-write-handler-reach.integration.test.ts | noAuth + `POST /api/backups ... reach handlers` |
| GET /api/backups/restore-runs/all | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-happy-path-read.integration.test.ts | noAuth + happy-path read case |
| GET /api/backups/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; full-app-handler-reach.integration.test.ts | noAuth + `reaches backups handler` |
| POST /api/backups/:id/restore | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; backups-write-handler-reach.integration.test.ts | noAuth + restore handler reach |
| POST /api/files | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; files-upload.integration.test.ts | noAuth + `POST /api/files uploads JPEG/PNG through real handler and can be fetched` |
| GET /api/files/:id | yes | true no-mock HTTP | full-app-no-mock.api.test.ts; files-upload.integration.test.ts; full-app-handler-reach.integration.test.ts | noAuth + upload/fetch + reach evidence |

## Coverage Summary
- Total endpoints: **90**
- Endpoints with HTTP tests: **90**
- Endpoints with true no-mock HTTP tests: **90**

Computed:
- HTTP coverage = 90/90 = **100.0%**
- True API coverage = 90/90 = **100.0%**

Strict caveat:
- `repo/backend/api_tests/full-app-no-mock.api.test.ts` gives complete endpoint reach via auth/signature-denial matrix but many assertions are shallow (status/envelope level).
- Mock-heavy top-level `*.api.test.ts` suites cannot be treated as true no-mock confidence.

## Unit Test Summary

### Backend Unit Tests
Evidence set: `repo/backend/unit_tests/*.test.ts`.

Observed coverage categories:
- Controllers: auth, master-data, classroom-ops, parking, logistics, after-sales, memberships, observability, configuration, backups.
- Services: auth, master-data, classroom-ops, parking, logistics, after-sales, memberships, observability, backups.
- Repositories: master-data, classroom-ops, parking, logistics, after-sales, memberships, observability, backups.
- Auth/guards/middleware/security: auth middleware, request middleware, rate limiter, idempotency middleware, TLS enforcement, API signing, AES encryption, password hashing, field masking/log sanitization.
- Jobs/workers/schedulers: import/export/carrier-sync/escalation-check/log-retention/backup/restore workers and daily backup scheduling.

Important backend modules with weaker direct unit focus:
- `repo/backend/src/app/server.ts` and full middleware chain behavior are primarily asserted via API/integration, not deep isolated unit coverage.
- `repo/backend/src/modules/files/routes.ts` has dedicated unit file (`files-router-unit.test.ts`) but core image-processing + duplicate-hash behavior still depends heavily on integration path realism.

### Frontend Unit Tests (STRICT)
Project type is fullstack, so frontend unit verification is mandatory.

Detection checks (strict):
- Identifiable frontend test files exist: yes (`repo/frontend/unit_tests/*.test.ts`, 24 files).
- Tests target frontend logic/components: yes.
- Framework/tooling evident: yes (`vitest`, `@vue/test-utils`, `happy-dom` in `repo/frontend/package.json`).
- Tests import/render actual frontend components/modules: yes.

Direct evidence examples:
- `repo/frontend/unit_tests/classroom-ops-view.test.ts`: imports `../src/modules/classroom-ops/ClassroomOpsView.vue`, mounts component (`mount(ClassroomOpsView, ...)`).
- `repo/frontend/unit_tests/login-view.test.ts`: imports `../src/app/views/LoginView.vue`, mounts component and submits form.
- `repo/frontend/unit_tests/admin-view.test.ts`: imports `../src/modules/admin/AdminView.vue`, mounts and validates tab behavior.
- `repo/frontend/unit_tests/dashboard-filters.test.ts`: imports `../src/modules/dashboard/DashboardView.vue`, mounts and validates UI filters.
- Additional module coverage present: after-sales, parking, memberships, observability, fulfillment, layout/navigation, shared components.

Important frontend modules/components not clearly directly unit-tested:
- `repo/frontend/src/main.ts` (bootstrap entrypoint) not explicitly unit-tested.
- Router composition in `repo/frontend/src/app/router/*` appears indirectly covered via guard/layout tests, but direct route-table-level unit assertion evidence is limited.

**Frontend unit tests: PRESENT**

Strict failure rule evaluation:
- Project type is fullstack.
- Frontend unit tests are present with direct component evidence.
- **No CRITICAL GAP triggered by missing frontend unit tests.**

### Cross-Layer Observation
- Backend coverage volume is larger than frontend coverage volume.
- Frontend is not untested; primary workflow views are represented by real mount-based tests.
- Residual risk remains around cross-view browser behaviors (partially deferred to E2E suites).

## API Observability Check
Strong:
- Endpoint, input shape, and response content are explicit in many tests. Examples:
  - `repo/backend/api_tests/integration/logistics-shipping-fee-calculate.integration.test.ts`: explicit calculate endpoint with success/not-found/org-boundary assertions.
  - `repo/backend/api_tests/integration/config-api.integration.test.ts`: explicit GET/PATCH config assertions.
  - `repo/backend/api_tests/integration/files-upload.integration.test.ts`: upload + fetch flow through real file handlers.

Weak:
- `repo/backend/api_tests/full-app-no-mock.api.test.ts` `noAuthCases` matrix is broad but mostly status/envelope checks for unauthorized paths, not deep domain assertions.
- Mocked top-level API suites can pass despite wiring regressions in real service/repository stacks.

## Tests Check
- Success paths: present across modules.
- Failure paths: present (401/403/404/409/422 and validation errors).
- Edge/validation: present (schema checks, idempotency behavior, signed observability ingestion, org isolation).
- Auth/permissions: strongly represented in both mocked and no-mock suites.
- Integration boundaries: represented by many no-mock DB-backed integration tests.
- Superficial assertion risk: moderate, concentrated in no-auth/no-signature endpoint-reach smoke matrix and mocked API suites.

`run_tests.sh` rule check:
- Docker-based orchestration: yes.
- Host-local dependency requirement for acceptance startup/tests: no.
- Verdict for this rule: **OK**.

## End-to-End Expectations (fullstack)
- Frontend browser E2E artifacts exist (`repo/frontend/e2e`, `repo/frontend/playwright.config.ts`).
- Given fullstack type, FE<->BE E2E presence is aligned with expectation.
- Partial compensation logic: not needed for missing FE tests here, because FE unit tests are present.

## Test Coverage Score (0-100)
**90 / 100**

## Score Rationale
- + Full endpoint inventory is covered by HTTP tests.
- + True no-mock HTTP evidence spans all endpoint groups through `full-app-no-mock.api.test.ts` plus module integration suites.
- + Broad backend unit and integration depth.
- + Frontend strict requirement met with direct component mount evidence.
- - Significant portion of top-level API suite is mock-heavy.
- - Some no-mock coverage is handler reach/contract-first rather than deep business-state assertions.

## Key Gaps
1. Mock-heavy API suites can mask regressions in real service/repository wiring.
2. Endpoint-wide no-auth smoke matrix is broad but semantically shallow for many business rules.
3. Frontend direct tests focus on views/components; router/bootstrap-level direct unit evidence is thinner.

## Confidence and Assumptions
- Confidence: **High** for endpoint inventory, classification, and README hard-gate checks.
- Assumptions:
  - Endpoint reach in no-mock suites accepted when exact METHOD+PATH call and HTTP assertion are visible.
  - Static inspection only; runtime behavior was not executed.

## Test Coverage Verdict
**PASS (strict mode)**

---

# README Audit

## Target README
- Required file exists: `repo/README.md`.

## Hard Gate Evaluation

### 1) Formatting
- Result: **PASS**
- Evidence: clean markdown hierarchy, sections, tables, and fenced command blocks.

### 2) Startup Instructions
- Type: fullstack.
- Required command appears explicitly: `docker-compose up`.
- Evidence: `repo/README.md` section "Running the Application".
- Result: **PASS**

### 3) Access Method
- Required for backend/web: URL + port.
- Evidence:
  - `https://localhost`
  - `https://localhost/api`
  - Ports table includes 443/4000/3306.
- Result: **PASS**

### 4) Verification Method
- Evidence: explicit smoke steps with expected results:
  - curl login call
  - authenticated `/api/auth/me` call
  - browser login flow verification
- Result: **PASS**

### 5) Environment Rules (STRICT)
- Disallowed startup/runtime instructions not found for app bootstrapping:
  - no mandatory host `npm install`, `pip install`, `apt-get`, or manual DB setup for running app.
- Startup flow documented as Docker-contained with seed container behavior.
- Result: **PASS**

### 6) Demo Credentials (auth conditional)
- Authentication explicitly required.
- Password provided (`password`).
- Role-to-username mapping present for all declared roles.
- Result: **PASS**

## Engineering Quality Review
- Tech stack clarity: strong.
- Architecture explanation: strong.
- Testing instructions: strong (`run_tests.sh`, suite locations, coverage mode).
- Security and roles: explicit (TLS, secrets, RBAC role list).
- Workflow reproducibility: strong.
- Presentation quality: high, but document is verbose.

## High Priority Issues
- None.

## Medium Priority Issues
1. README includes an extensive implementation-status narrative that may drift from code over time, raising maintenance risk.

## Low Priority Issues
1. Operational startup path is clear, but some sections are verbose relative to onboarding needs.

## Hard Gate Failures
- None.

## README Verdict
**PASS**

---

# Final Verdicts
- Test Coverage Audit: **PASS (strict mode)**
- README Audit: **PASS**
