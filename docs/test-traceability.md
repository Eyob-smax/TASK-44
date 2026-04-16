# CampusOps — Requirement-to-Test Traceability

This document maps major functional requirements and business rules to the test files that exercise them. It provides an inspectable audit trail for static acceptance reviews.

## Test Corpus Summary

| Suite | Location | File Count |
|-------|----------|-----------|
| Backend unit tests | `backend/unit_tests/` | 51 |
| Backend API tests (contract + integration) | `backend/api_tests/` | 26 |
| Frontend unit / component tests | `frontend/unit_tests/` | 19 |
| **Total** | | **96** |

## Running Tests

```bash
# All tests (from repo/ root):
./run_tests.sh

# With coverage reports:
COVERAGE=true ./run_tests.sh
```

---

## 1. Authentication & Authorization

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| Login with valid credentials → JWT + user returned | `api_tests/auth.api.test.ts` | `status=200`, `data.token` present |
| Missing password field → 400 VALIDATION_ERROR | `api_tests/auth.api.test.ts` | `error.code='VALIDATION_ERROR'`, `details.password` |
| Invalid credentials → 401 UNAUTHORIZED | `api_tests/auth.api.test.ts` | `status=401`, `error.code='UNAUTHORIZED'` |
| No Authorization header → 401 | `api_tests/auth.api.test.ts` | `GET /api/auth/me` without token |
| Invalid token → 401 | `api_tests/auth.api.test.ts` | malformed Bearer token |
| Valid JWT → 200 /me response | `api_tests/auth.api.test.ts` | real token signed with test secret |
| `POST /api/auth/logout` (no Authorization header) → 401 | `api_tests/auth.api.test.ts` | unauthenticated request rejected |
| `POST /api/auth/logout` (authenticated) → 200 + security event recorded | `api_tests/auth.api.test.ts` | `recordSecurityEvent` called with logout type |
| Auditor role cannot create users | `api_tests/rbac.api.test.ts` | `POST /api/admin/users` → 403 |
| Non-existent user → 401 (no username enumeration) + loginAttempt recorded | `unit_tests/auth-login-unit.test.ts` | `recordLoginAttempt` called; `updateLoginFailure` not called |
| Inactive user account → 401 "Account disabled" | `unit_tests/auth-login-unit.test.ts` | `isActive=false` guard |
| Locked account (lockedUntil future) → 401 "temporarily locked" | `unit_tests/auth-login-unit.test.ts` | `lockedUntil > now` check |
| Wrong password → increments failedAttempts, records security event | `unit_tests/auth-login-unit.test.ts` | `updateLoginFailure(id, newCount, undefined)` |
| 5th failed attempt → sets lockedUntil ~30 min in future | `unit_tests/auth-login-unit.test.ts` | `lockedUntil instanceof Date`, ~30 min delta |
| Successful login → JWT + roles + permissions returned | `unit_tests/auth-login-unit.test.ts` | `token.split('.')` length=3, `permissions` array |
| Expired lockout (lockedUntil in past) → allows login | `unit_tests/auth-login-unit.test.ts` | token defined after past lock |
| Administrator role passes role gate | `api_tests/rbac.api.test.ts` | non-403 when Administrator |
| No token on admin route → 401 | `api_tests/rbac.api.test.ts` | unauthenticated request |
| Password bcrypt hash + verify | `unit_tests/password-hashing.test.ts` | round-trip, wrong password fails |
| Auth service login + lockout | `unit_tests/auth-service-unit.test.ts` | correct pass passes, wrong fails |
| Route guard: unauthenticated → /login | `frontend/unit_tests/auth.guard.test.ts` | `next({ name: 'login' })` |
| Route guard: public route passes through | `frontend/unit_tests/auth.guard.test.ts` | `next()` on public meta |
| Route guard: authenticated → /dashboard (from /login) | `frontend/unit_tests/auth.guard.test.ts` | redirect away from login |
| Route guard: missing permission → /forbidden | `frontend/unit_tests/auth.guard.test.ts` | `requiredPermission` enforcement |
| Route guard: missing role → /forbidden | `frontend/unit_tests/auth.guard.test.ts` | `requiredRoles` enforcement |
| Route guard: matching permission allows access | `frontend/unit_tests/auth.guard.test.ts` | `next()` when permission present |

---

## 2. Field Masking & Protected Data

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| FULL mask → `***` (string and number) | `unit_tests/field-masking.test.ts` | both types replaced |
| PARTIAL mask → `****{last4}`, short strings fully masked | `unit_tests/field-masking.test.ts` | ≤4 chars → `***`, longer shows tail |
| HASH mask → 12-char hex prefix | `unit_tests/field-masking.test.ts` | deterministic, hex only |
| Administrator role bypasses all masks | `unit_tests/field-masking.test.ts` | raw value returned |
| Non-admin role receives masked value | `unit_tests/field-masking.test.ts` | mask applied |
| Auditor wallet balance read-only (masked) | `frontend/unit_tests/memberships-view.test.ts` | no top-up/spend inputs visible |
| OpsManager sees wallet controls | `frontend/unit_tests/memberships-view.test.ts` | top-up input present |
| Log sanitization masks passwords, tokens | `unit_tests/log-sanitization.test.ts` | sensitive keys replaced in log output |

---

## 3. Idempotency

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| X-Idempotency-Key > 64 chars → 400 VALIDATION_ERROR | `api_tests/idempotency.api.test.ts` | `error.code='VALIDATION_ERROR'` |
| Key ≤ 64 chars passes key validation | `api_tests/idempotency.api.test.ts` | not 400 due to key |
| In-flight sentinel detection | `unit_tests/idempotency-middleware.test.ts` | empty string body = in-flight |
| Replay detection (populated body + not expired) | `unit_tests/idempotency-middleware.test.ts` | `isReplay()` logic |
| Expired row not replayed | `unit_tests/idempotency-middleware.test.ts` | `expiresAt < now` |
| Key TTL is ~24 hours | `unit_tests/idempotency-middleware.test.ts` | `buildIdempotencyKey()` expiresAt |
| Wallet top-up idempotent | `api_tests/memberships.api.test.ts` | second call → same result |
| Fulfillment idempotency key | `api_tests/memberships.api.test.ts` | `idempotencyKey` in body |
| Fulfillment idempotency replay (DB-backed, no mocks) | `api_tests/integration/memberships-fulfillment.integration.test.ts` | same `idempotencyKey` returns same request ID |
| Shipment idempotency header | `api_tests/logistics.api.test.ts` | same X-Idempotency-Key → same response |
| Shipment idempotency replay (DB-backed, no mocks) | `api_tests/integration/logistics-shipments.integration.test.ts` | same key replays same `shipment.id` and avoids duplicate DB rows |
| Frontend shipment adapter sends idempotency in header | `frontend/unit_tests/idempotency-header-contract.test.ts` | `X-Idempotency-Key` sent, no body key |
| Frontend wallet adapters send idempotency in header | `frontend/unit_tests/idempotency-header-contract.test.ts` | topup/spend use `X-Idempotency-Key` |
| `generateIdempotencyKey()` produces UUID | `frontend/unit_tests/idempotency-submit.test.ts` | format check |
| Duplicate submit protection in UI | `frontend/unit_tests/idempotency-submit.test.ts` | button disabled on in-flight |

---

## 4. Classroom Ops — Anomaly Lifecycle

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| `open` → `acknowledged` (valid) | `unit_tests/anomaly-resolution.test.ts` | `canAcknowledge(OPEN)=true` |
| `acknowledged` → re-acknowledge → rejected | `unit_tests/anomaly-resolution.test.ts` | `canAcknowledge(ACKNOWLEDGED)=false` |
| `assigned` cannot be acknowledged | `unit_tests/anomaly-resolution.test.ts` | `canAcknowledge(ASSIGNED)=false` |
| `resolved` cannot be acknowledged | `unit_tests/anomaly-resolution.test.ts` | `canAcknowledge(RESOLVED)=false` |
| `open` → `assigned` (valid) | `unit_tests/anomaly-resolution.test.ts` | `canAssign(OPEN)=true` |
| `acknowledged` → `assigned` (valid) | `unit_tests/anomaly-resolution.test.ts` | `canAssign(ACKNOWLEDGED)=true` |
| `resolved` cannot be assigned | `unit_tests/anomaly-resolution.test.ts` | `canAssign(RESOLVED)=false` |
| Any non-resolved → `resolved` (valid) | `unit_tests/anomaly-resolution.test.ts` | `canResolve(open/ack)=true` |
| `resolved` → resolve again → rejected | `unit_tests/anomaly-resolution.test.ts` | `canResolve(RESOLVED)=false` |
| resolutionNote non-empty required | `unit_tests/anomaly-resolution.test.ts` | whitespace-only fails |
| `POST .../acknowledge` → 200 | `api_tests/classroom-ops.api.test.ts` | happy path |
| `POST .../acknowledge` (already ack) → 409 CONFLICT | `api_tests/classroom-ops.api.test.ts` | ConflictError mapped |
| `POST .../assign` → 200 | `api_tests/classroom-ops.api.test.ts` | happy path |
| `POST .../assign` (resolved) → 422 | `api_tests/classroom-ops.api.test.ts` | UnprocessableError mapped |
| `POST .../resolve` with note → 200 | `api_tests/classroom-ops.api.test.ts` | happy path |
| `POST .../resolve` without note → 400 VALIDATION_ERROR | `api_tests/classroom-ops.api.test.ts` | schema enforcement |
| `POST .../resolve` (already resolved) → 422 | `api_tests/classroom-ops.api.test.ts` | UnprocessableError mapped |
| `POST .../resolve` (race-condition duplicate) → 409 CONFLICT | `api_tests/classroom-ops.api.test.ts` | ConflictError mapped |
| `POST /api/classroom-ops/heartbeat` (same org) → 200 | `api_tests/classroom-ops.api.test.ts` | `ingestHeartbeat` called |
| `POST /api/classroom-ops/heartbeat` (cross-org) → 404 | `api_tests/classroom-ops.api.test.ts` | NOT_FOUND on foreign classroom |
| `POST /api/classroom-ops/heartbeat` (invalid UUID) → 400 | `api_tests/classroom-ops.api.test.ts` | VALIDATION_ERROR |
| `POST /api/classroom-ops/confidence` → 200 | `api_tests/classroom-ops.api.test.ts` | confidence sample recorded |
| `POST /api/classroom-ops/confidence` (out of [0,1]) → 400 | `api_tests/classroom-ops.api.test.ts` | schema bounds enforced |
| `POST /api/classroom-ops/anomalies` → 201 | `api_tests/classroom-ops.api.test.ts` | anomaly created |
| `POST /api/classroom-ops/anomalies` (ineligible role) → 403 | `api_tests/classroom-ops.api.test.ts` | permission gate |
| `POST /api/classroom-ops/anomalies` (invalid severity) → 400 | `api_tests/classroom-ops.api.test.ts` | VALIDATION_ERROR |
| `GET /api/classroom-ops/anomalies` → 200 + paginated, orgId forwarded | `api_tests/classroom-ops.api.test.ts` | `listAnomalies` receives orgId |
| `GET /api/classroom-ops/anomalies` (no permission) → 403 | `api_tests/classroom-ops.api.test.ts` | permission gate |
| `GET /api/classroom-ops/anomalies/:id` (same org) → 200 | `api_tests/classroom-ops.api.test.ts` | anomaly detail returned |
| `GET /api/classroom-ops/anomalies/:id` (not found) → 404 | `api_tests/classroom-ops.api.test.ts` | null → NOT_FOUND |
| `GET /api/classroom-ops/anomalies/:id` (cross-org) → 404 | `api_tests/classroom-ops.api.test.ts` | org isolation |
| `GET /api/classroom-ops/dashboard` (same-org campus) → 200 | `api_tests/classroom-ops.api.test.ts` | dashboard payload |
| `GET /api/classroom-ops/dashboard` (missing campusId) → 400 | `api_tests/classroom-ops.api.test.ts` | VALIDATION_ERROR |
| `GET /api/classroom-ops/dashboard` (cross-org campus) → 404 | `api_tests/classroom-ops.api.test.ts` | org isolation |
| Cross-org anomaly action requests return 404 | `api_tests/classroom-ops.api.test.ts` | acknowledge denied with NOT_FOUND |
| `ingestHeartbeat`: throws NotFoundError when classroom not found | `unit_tests/classroom-ops-service-unit.test.ts` | `upsertHeartbeat` not called |
| No anomaly when heartbeat fresh and classroom status online | `unit_tests/classroom-ops-service-unit.test.ts` | `createAnomalyEvent` not called |
| CONNECTIVITY_LOSS HIGH anomaly when heartbeat older than threshold | `unit_tests/classroom-ops-service-unit.test.ts` | `type='connectivity_loss'`, `severity='high'` |
| CONNECTIVITY_LOSS anomaly when classroom status is offline (regardless of heartbeat age) | `unit_tests/classroom-ops-service-unit.test.ts` | `createAnomalyEvent` called |
| Metadata forwarded to `upsertHeartbeat` | `unit_tests/classroom-ops-service-unit.test.ts` | `{agent, cpu}` payload passed through |
| No anomaly when `lastHeartbeatAt` is null and status online (first heartbeat) | `unit_tests/classroom-ops-service-unit.test.ts` | `createAnomalyEvent` not called |
| `ingestConfidence`: throws NotFoundError when classroom not found | `unit_tests/classroom-ops-service-unit.test.ts` | `insertConfidenceSample` not called |
| Confidence ≥ 0.7 → sample recorded, no anomaly | `unit_tests/classroom-ops-service-unit.test.ts` | `createAnomalyEvent` not called |
| Confidence 0.5–0.7 → MEDIUM CONFIDENCE_DROP anomaly | `unit_tests/classroom-ops-service-unit.test.ts` | `severity='medium'`, description contains percentage |
| Confidence < 0.5 → HIGH CONFIDENCE_DROP anomaly | `unit_tests/classroom-ops-service-unit.test.ts` | `severity='high'` |
| Confidence boundary === 0.7 → no anomaly | `unit_tests/classroom-ops-service-unit.test.ts` | exact boundary excluded |
| Confidence boundary === 0.5 → MEDIUM (not HIGH) | `unit_tests/classroom-ops-service-unit.test.ts` | boundary inclusive to medium |
| `acknowledgeAnomaly`: throws NotFoundError when anomaly not found | `unit_tests/classroom-ops-service-unit.test.ts` | `createAcknowledgement` not called |
| `acknowledgeAnomaly`: throws UnprocessableError when status is not OPEN | `unit_tests/classroom-ops-service-unit.test.ts` | resolved status rejected |
| `acknowledgeAnomaly`: creates acknowledgement when OPEN | `unit_tests/classroom-ops-service-unit.test.ts` | `createAcknowledgement` called |
| `assignAnomaly`: throws NotFoundError when not found | `unit_tests/classroom-ops-service-unit.test.ts` | `createAssignment` not called |
| `assignAnomaly`: rejects when RESOLVED | `unit_tests/classroom-ops-service-unit.test.ts` | UnprocessableError |
| `assignAnomaly`: allows when OPEN or ACKNOWLEDGED | `unit_tests/classroom-ops-service-unit.test.ts` | `createAssignment` called |
| `resolveAnomaly`: throws NotFoundError when not found | `unit_tests/classroom-ops-service-unit.test.ts` | `createResolution` not called |
| `resolveAnomaly`: throws UnprocessableError when already RESOLVED | `unit_tests/classroom-ops-service-unit.test.ts` | double-resolve rejected |
| `resolveAnomaly`: allows resolution when OPEN | `unit_tests/classroom-ops-service-unit.test.ts` | `createResolution` called |
| `getClassroomDashboard`: one row per classroom with confidence + open anomaly count | `unit_tests/classroom-ops-service-unit.test.ts` | null confidence when no sample |
| `getClassroomDashboard`: returns empty array when campus has no classrooms | `unit_tests/classroom-ops-service-unit.test.ts` | `[]` |

---

## 5. Parking — Exceptions & Escalation

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| `ESCALATION_THRESHOLD_MS` = 15 min in ms | `unit_tests/parking-escalation.test.ts` | value check |
| `isEscalationEligible`: open + >15 min → true | `unit_tests/parking-escalation.test.ts` | past threshold |
| `isEscalationEligible`: open + exactly 15 min → true | `unit_tests/parking-escalation.test.ts` | at boundary |
| `isEscalationEligible`: open + <15 min → false | `unit_tests/parking-escalation.test.ts` | below threshold |
| `isEscalationEligible`: escalated → false | `unit_tests/parking-escalation.test.ts` | status check |
| `isEscalationEligible`: resolved → false | `unit_tests/parking-escalation.test.ts` | status check |
| Entry with no plate → `no_plate` exception | `api_tests/parking.api.test.ts` | exception.type='no_plate' |
| Valid entry → session created | `api_tests/parking.api.test.ts` | session in response |
| Duplicate entry → `duplicate_plate` exception | `api_tests/parking.api.test.ts` | exception.type='duplicate_plate' |
| Resolve with note → 200 | `api_tests/parking.api.test.ts` | resolved status |
| Resolve without note → 400 VALIDATION_ERROR | `api_tests/parking.api.test.ts` | empty resolutionNote |
| Resolve with empty string note → 400 | `api_tests/parking.api.test.ts` | schema rejects empty string |
| Escalate → 200 | `api_tests/parking.api.test.ts` | escalation response |
| Escalate (not found) → 404 | `api_tests/parking.api.test.ts` | null exception → 404 |
| Cross-org exception fetch/escalate return 404 | `api_tests/parking.api.test.ts` | object-scope enforcement |
| Missing readerId → 400 VALIDATION_ERROR | `api_tests/parking.api.test.ts` | required field |
| `GET /api/parking/facilities` → 200 with facilities scoped to org | `api_tests/parking.api.test.ts` | `listFacilities` called with orgId |
| `GET /api/parking/facilities` (no read:parking) → 403 | `api_tests/parking.api.test.ts` | FORBIDDEN envelope |
| `GET /api/parking/facilities/:id/status` → 200 + summary | `api_tests/parking.api.test.ts` | `getParkingStatusSummary` called with facilityId + orgId |
| `GET /api/parking/facilities/:id/status` (not found in org) → 404 | `api_tests/parking.api.test.ts` | NotFoundError mapped |
| `GET /api/parking/facilities/:id/status` (no read:parking) → 403 | `api_tests/parking.api.test.ts` | permission gate |
| `ingestParkingEvent`: throws NotFoundError when reader not found | `unit_tests/parking-service-unit.test.ts` | `createParkingEvent` not called |
| Cross-tenant reader access rejected with NotFoundError | `unit_tests/parking-service-unit.test.ts` | facility orgId mismatch |
| Returns `no_plate_exception` when plateNumber is null | `unit_tests/parking-service-unit.test.ts` | `createSession` not called |
| Creates new session for entry event with no existing active session | `unit_tests/parking-service-unit.test.ts` | `action='session_created'` |
| Duplicate entry raises `duplicate_plate_exception` | `unit_tests/parking-service-unit.test.ts` | `createException` with `type='duplicate_plate'` |
| Completes active session on matching exit event | `unit_tests/parking-service-unit.test.ts` | `action='session_completed'` |
| Exit with no active session raises `inconsistent_entry_exit_exception` | `unit_tests/parking-service-unit.test.ts` | `createException` called |
| Unknown event type → `noop` action | `unit_tests/parking-service-unit.test.ts` | no session/exception created |
| `checkOvertimeSessions`: returns empty when no sessions exceed threshold | `unit_tests/parking-service-unit.test.ts` | `createException` not called |
| Creates overtime exception only for sessions without existing one | `unit_tests/parking-service-unit.test.ts` | `hasOpenOvertimeException` gate |
| Honors custom `overtimeThresholdHours` parameter | `unit_tests/parking-service-unit.test.ts` | cutoff Date computed correctly |
| `checkUnsettledSessions`: creates UNSETTLED exception for sessions without existing one | `unit_tests/parking-service-unit.test.ts` | `hasUnsettledException` gate |
| `escalateDueExceptions`: returns empty when no exceptions or none eligible | `unit_tests/parking-service-unit.test.ts` | role lookup not called |
| `escalateDueExceptions`: returns empty when OpsManager role not seeded or no user has role | `unit_tests/parking-service-unit.test.ts` | `escalateException` not called |
| `escalateDueExceptions`: escalates only eligible exceptions to supervisor | `unit_tests/parking-service-unit.test.ts` | 2 of 3 exceptions escalated |
| `getParkingStatusSummary`: delegates directly to repository | `unit_tests/parking-service-unit.test.ts` | `getParkingStatus` called |
| `EscalationCheckWorker`: returns early when facility not found | `unit_tests/escalation-check-worker.test.ts` | `parkingException.findMany` not called |
| Returns early when no open exceptions exist | `unit_tests/escalation-check-worker.test.ts` | `role.findFirst` not called |
| Does not escalate when no exception crossed threshold | `unit_tests/escalation-check-worker.test.ts` | fresh exception skipped |
| Warns and returns when OpsManager role not seeded | `unit_tests/escalation-check-worker.test.ts` | `escalateException` not called |
| Warns and returns when no org-scoped OpsManager user | `unit_tests/escalation-check-worker.test.ts` | `escalateException` not called |
| Escalates every eligible open exception to org-scoped supervisor | `unit_tests/escalation-check-worker.test.ts` | called exactly 2 times for eligible exceptions |
| Continues escalating remaining exceptions when one repo call throws | `unit_tests/escalation-check-worker.test.ts` | bulk error doesn't abort batch |
| Exposes `escalation_check` as worker type | `unit_tests/escalation-check-worker.test.ts` | `worker.type` value |

---

## 6. Logistics — Shipping & Fees

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| `calculateShippingFee`: no overage → baseFee only | `unit_tests/shipping-fee-calculation.test.ts` | additionalWeightFee=0 |
| `calculateShippingFee`: overage fee = overageLb × perLbFee | `unit_tests/shipping-fee-calculation.test.ts` | computed correctly |
| `calculateShippingFee`: overage fee rounded to 2dp | `unit_tests/shipping-fee-calculation.test.ts` | 0.125 → 0.13 |
| `calculateShippingFee`: applicable surcharge added | `unit_tests/shipping-fee-calculation.test.ts` | matching condition |
| `calculateShippingFee`: non-matching surcharge not added | `unit_tests/shipping-fee-calculation.test.ts` | different condition |
| `calculateShippingFee`: multiple surcharges | `unit_tests/shipping-fee-calculation.test.ts` | all matching applied |
| Breakdown array includes base fee label | `unit_tests/shipping-fee-calculation.test.ts` | label='Base fee' |
| Breakdown includes weight label on overage | `unit_tests/shipping-fee-calculation.test.ts` | label contains 'Additional weight' |
| AES-256 carrier connectorConfig encrypted | `unit_tests/aes256-encryption.test.ts` | encrypt/decrypt round-trip |
| `POST /api/shipments` → 201 + parcels | `api_tests/logistics.api.test.ts` | parcels in response |
| Idempotent shipment (same key) → same result | `api_tests/logistics.api.test.ts` | res1.id == res2.id |
| `GET /api/shipments/:id` → 200 | `api_tests/logistics.api.test.ts` | parcels + tracking |
| `GET /api/shipments/:id` (not found) → 404 | `api_tests/logistics.api.test.ts` | NotFoundError mapped |
| `POST /api/shipments/:id/tracking` → 200 | `api_tests/logistics.api.test.ts` | recordTrackingUpdate called |
| Delivered status calls with 'delivered' | `api_tests/logistics.api.test.ts` | source='manual' default |
| `GET /api/orgs/:orgId/warehouses` → list | `api_tests/logistics.api.test.ts` | array in response |
| `GET /api/orgs/:orgId/shipments` → paginated list | `api_tests/logistics.api.test.ts` | data array + meta.total |
| DB-backed shipment list is org-scoped | `api_tests/integration/logistics-memberships-api.integration.test.ts` | same-org returns only own shipment |
| DB-backed cross-org shipment list denied | `api_tests/integration/logistics-memberships-api.integration.test.ts` | org mismatch returns 404 |
| DB-backed shipment tracking update transitions shipment to delivered | `api_tests/integration/logistics-shipments.integration.test.ts` | `/tracking` update sets shipment status + persisted tracking row |
| DB-backed shipment fetch hides cross-org resource behind 404 | `api_tests/integration/logistics-shipments.integration.test.ts` | org mismatch on `/api/shipments/:id` returns NOT_FOUND |
| DB-backed shipping fee calculate endpoint resolves template + surcharges | `api_tests/integration/logistics-shipping-fee-calculate.integration.test.ts` | `GET /api/orgs/:orgId/shipping-fee-templates/calculate` returns computed total |
| DB-backed shipping fee calculate returns 404 when no template matches | `api_tests/integration/logistics-shipping-fee-calculate.integration.test.ts` | unmatched region/tier returns NOT_FOUND |
| DB-backed shipping fee calculate enforces org boundary | `api_tests/integration/logistics-shipping-fee-calculate.integration.test.ts` | cross-org token/path mismatch returns 404 |
| Missing `read:logistics` permission → 403 | `api_tests/logistics.api.test.ts` | permission enforcement inline |
| `POST /api/orgs/:orgId/warehouses` (valid) → 201 | `api_tests/logistics.api.test.ts` | warehouse record returned |
| `POST /api/orgs/:orgId/warehouses` (missing name) → 400 | `api_tests/logistics.api.test.ts` | VALIDATION_ERROR |
| `POST /api/orgs/:orgId/warehouses` (no write:logistics) → 403 | `api_tests/logistics.api.test.ts` | permission gate |
| `GET /api/orgs/:orgId/carriers` → 200 + carriers list | `api_tests/logistics.api.test.ts` | `listCarriers` returns array |
| `GET /api/orgs/:orgId/shipping-fee-templates` → 200 + templates list | `api_tests/logistics.api.test.ts` | template array in response |
| `POST /api/orgs/:orgId/shipping-fee-templates` (eligible role) → 201 | `api_tests/logistics.api.test.ts` | template created |
| `POST /api/orgs/:orgId/shipping-fee-templates` (ineligible role) → 403 | `api_tests/logistics.api.test.ts` | permission gate |
| `POST /api/orgs/:orgId/shipping-fee-templates` (baseFee ≤ 0) → 400 | `api_tests/logistics.api.test.ts` | VALIDATION_ERROR |
| `POST /api/orgs/:orgId/delivery-zones` (Administrator) → 201 | `api_tests/logistics.api.test.ts` | zone created |
| `POST /api/orgs/:orgId/delivery-zones` (non-Administrator) → 403 | `api_tests/logistics.api.test.ts` | role gate |
| `POST /api/orgs/:orgId/delivery-zones` (empty zipPatterns) → 400 | `api_tests/logistics.api.test.ts` | VALIDATION_ERROR |
| `POST /api/orgs/:orgId/non-serviceable-zips` (Administrator, 5-digit) → 201 | `api_tests/logistics.api.test.ts` | ZIP persisted |
| `POST /api/orgs/:orgId/non-serviceable-zips` (invalid ZIP) → 400 | `api_tests/logistics.api.test.ts` | schema regex enforced |
| rest_api connector fetches and stores updates | `unit_tests/carrier-sync-worker.test.ts` | addTrackingUpdate called 2x |
| rest_api connector HTTP failure → sets errorState + rethrows | `unit_tests/carrier-sync-worker.test.ts` | cursor.errorState set |
| rest_api connector empty response → cursor updated | `unit_tests/carrier-sync-worker.test.ts` | addTrackingUpdate not called |
| file_drop connector processes new .json files | `unit_tests/carrier-sync-worker.test.ts` | addTrackingUpdate + renameSync called |
| file_drop skips non-JSON files | `unit_tests/carrier-sync-worker.test.ts` | readFileSync not called |
| file_drop skips files before last cursor | `unit_tests/carrier-sync-worker.test.ts` | skipped by mtime check |
| manual connector: no-op, updates cursor | `unit_tests/carrier-sync-worker.test.ts` | addTrackingUpdate not called |
| carrier not found → early return | `unit_tests/carrier-sync-worker.test.ts` | upsert not called |
| `calculateFee`: throws NotFoundError when no template matches region/tier/itemCount | `unit_tests/logistics-service-unit.test.ts` | `findTemplateByRegionAndTier` returns null |
| `calculateFee`: base-only fee when weight ≤ baseWeightLb and no surcharges | `unit_tests/logistics-service-unit.test.ts` | `additionalWeightFee=0`, `totalFee=baseFee` |
| `calculateFee`: per-lb overage added when weight exceeds baseWeightLb | `unit_tests/logistics-service-unit.test.ts` | `additionalWeightFee=(excess)*perLbFee` |
| `calculateFee`: only surcharges matching `applicableSurcharges` are added | `unit_tests/logistics-service-unit.test.ts` | 2 of 3 surcharges applied |
| `createShipment`: throws NotFoundError when warehouse not found | `unit_tests/logistics-service-unit.test.ts` | `createShipment` not called |
| `createShipment`: throws NotFoundError when warehouse is cross-tenant | `unit_tests/logistics-service-unit.test.ts` | orgId mismatch rejected |
| `createShipment`: throws NotFoundError when carrier not found | `unit_tests/logistics-service-unit.test.ts` | `createShipment` not called |
| `createShipment`: throws NotFoundError when carrier is cross-tenant | `unit_tests/logistics-service-unit.test.ts` | orgId mismatch rejected |
| `createShipment`: succeeds when warehouse and carrier are both in-org | `unit_tests/logistics-service-unit.test.ts` | `createShipment` called |
| `recordTrackingUpdate`: throws NotFoundError when shipment not found | `unit_tests/logistics-service-unit.test.ts` | `addTrackingUpdate` not called |
| `recordTrackingUpdate`: records update and sets `shippedAt` for "shipped" status | `unit_tests/logistics-service-unit.test.ts` | `updateShipmentStatus` called with Date |
| `recordTrackingUpdate`: records update without timestamp metadata for "in_transit" | `unit_tests/logistics-service-unit.test.ts` | no timestamp in update call |
| `recordTrackingUpdate`: records update and sets `deliveredAt` for "delivered" status | `unit_tests/logistics-service-unit.test.ts` | `deliveredAt` Date present |
| `recordTrackingUpdate`: adds tracking entry but does NOT change shipment status for "exception" | `unit_tests/logistics-service-unit.test.ts` | `updateShipmentStatus` not called |
| `getShipmentWithDetails`: throws NotFoundError when shipment not found | `unit_tests/logistics-service-unit.test.ts` | null → error |
| `getShipmentWithDetails`: returns shipment with repo shape when found | `unit_tests/logistics-service-unit.test.ts` | same reference returned |

---

## 7. After-Sales — Tickets, Evidence & Compensation

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| `remainingCompensationBudget(0, 50)` → 50 | `unit_tests/compensation-rules.test.ts` | full cap |
| `remainingCompensationBudget(30, 50)` → 20 | `unit_tests/compensation-rules.test.ts` | partial |
| `remainingCompensationBudget(50, 50)` → 0 | `unit_tests/compensation-rules.test.ts` | fully consumed |
| `remainingCompensationBudget(55, 50)` → 0 (never negative) | `unit_tests/compensation-rules.test.ts` | over-cap guard |
| `capCompensation(30, 0, 50)` → 30 | `unit_tests/compensation-rules.test.ts` | within cap |
| `capCompensation(30, 25, 50)` → 25 | `unit_tests/compensation-rules.test.ts` | capped at remaining |
| `capCompensation(100, 0, 50)` → 50 | `unit_tests/compensation-rules.test.ts` | capped at max |
| `DEFAULT_COMPENSATION_CAP` = $50.00 | `unit_tests/compensation-rules.test.ts` | value check |
| SLA: urgent → 4h, high → 8h, medium → 24h, low → 72h | `unit_tests/sla-deadline.test.ts` | each priority |
| SLA breach: past deadline → true | `unit_tests/sla-deadline.test.ts` | isSlaBreached |
| SLA approaching: within 4h window → true | `unit_tests/sla-deadline.test.ts` | isSlaApproaching |
| SLA approaching: breached already → false | `unit_tests/sla-deadline.test.ts` | no double-flag |
| Unknown priority → throws | `unit_tests/sla-deadline.test.ts` | error propagation |
| `POST /api/orgs/:orgId/tickets` → 201 + timeline | `api_tests/after-sales.api.test.ts` | timeline[0].entryType='created' |
| Missing fields → 400 VALIDATION_ERROR | `api_tests/after-sales.api.test.ts` | required field validation |
| `POST .../suggest-compensation` → 201 pending | `api_tests/after-sales.api.test.ts` | status='pending' |
| `POST .../suggest-compensation` (cap reached) → 201 null | `api_tests/after-sales.api.test.ts` | data=null |
| `POST .../approve` (approved) → 200 | `api_tests/after-sales.api.test.ts` | decision='approved' |
| `POST .../approve` (rejected + notes) → 200 | `api_tests/after-sales.api.test.ts` | decision='rejected' |
| `POST .../approve` (already processed) → 422 | `api_tests/after-sales.api.test.ts` | UnprocessableError |
| `POST .../evidence` → 201 + timeline entry | `api_tests/after-sales.api.test.ts` | entryType='evidence_added' |
| DB-backed `GET /api/orgs/:orgId/tickets` returns org-scoped tickets only | `api_tests/integration/after-sales-tickets.integration.test.ts` | own-org list returns only own ticket |
| DB-backed `GET /api/orgs/:orgId/tickets` rejects cross-org access | `api_tests/integration/after-sales-tickets.integration.test.ts` | enforceSameOrg returns 404 |
| DB-backed `GET /api/orgs/:orgId/tickets` enforces read permission | `api_tests/integration/after-sales-tickets.integration.test.ts` | missing `read:after-sales:*` returns 403 |
| SLA overdue indicator in UI | `frontend/unit_tests/after-sales-view.test.ts` | `.sla-overdue` class |
| SLA near indicator in UI | `frontend/unit_tests/after-sales-view.test.ts` | `.sla-near` class |
| Far deadline → no SLA classes | `frontend/unit_tests/after-sales-view.test.ts` | neither class |
| `createTicket`: creates medium-priority ticket with 24h SLA deadline when priority omitted | `unit_tests/after-sales-service-unit.test.ts` | `priority='medium'`, ~24h delta |
| `createTicket`: sets 4h SLA deadline for urgent priority | `unit_tests/after-sales-service-unit.test.ts` | ~4h delta |
| `createTicket`: throws NotFoundError when shipmentId refers to missing shipment | `unit_tests/after-sales-service-unit.test.ts` | `createTicket` not called |
| `createTicket`: throws NotFoundError when shipment belongs to different org | `unit_tests/after-sales-service-unit.test.ts` | org boundary enforced |
| `createTicket`: throws NotFoundError when parcel not found | `unit_tests/after-sales-service-unit.test.ts` | `createTicket` not called |
| `createTicket`: throws NotFoundError when parcel is cross-org or doesn't match shipment | `unit_tests/after-sales-service-unit.test.ts` | org + shipment boundary |
| `addEvidence`: throws NotFoundError when ticket not found | `unit_tests/after-sales-service-unit.test.ts` | `addEvidence` repo not called |
| `addEvidence`: throws UnprocessableError when ticket is CLOSED | `unit_tests/after-sales-service-unit.test.ts` | closed guard |
| `addEvidence`: adds evidence when ticket is open | `unit_tests/after-sales-service-unit.test.ts` | `addEvidence` called with fileAssetId |
| `suggestCompensation`: throws NotFoundError when ticket not found | `unit_tests/after-sales-service-unit.test.ts` | `createSuggestion` not called |
| `suggestCompensation`: throws UnprocessableError when ticket type has no compensation trigger | `unit_tests/after-sales-service-unit.test.ts` | "other" type rejected |
| `suggestCompensation`: throws NotFoundError when no active policy for trigger type | `unit_tests/after-sales-service-unit.test.ts` | empty policies |
| `suggestCompensation`: throws UnprocessableError when compensation cap exhausted | `unit_tests/after-sales-service-unit.test.ts` | `createSuggestion` not called |
| `suggestCompensation`: creates suggestion capped at per-ticket remaining budget | `unit_tests/after-sales-service-unit.test.ts` | `suggestedAmount` capped to remaining |
| `suggestCompensation`: creates suggestion with full policy amount when budget allows | `unit_tests/after-sales-service-unit.test.ts` | full `compensationAmount` used |
| `approveCompensation`: throws NotFoundError when suggestion not found | `unit_tests/after-sales-service-unit.test.ts` | `createApproval` not called |
| `approveCompensation`: throws UnprocessableError when suggestion is not pending | `unit_tests/after-sales-service-unit.test.ts` | already-approved rejected |
| `approveCompensation`: throws UnprocessableError when approval would exceed cap | `unit_tests/after-sales-service-unit.test.ts` | cap guard |
| `approveCompensation`: records approved decision when within cap | `unit_tests/after-sales-service-unit.test.ts` | `createApproval` with `decision='approved'` |
| `approveCompensation`: records rejected decision without checking cap | `unit_tests/after-sales-service-unit.test.ts` | `findApprovedSuggestionsTotal` not called |

---

## 8. Memberships — Pricing, Coupons, Wallets, Growth Points

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| Member pricing: 10% off $10 → $9.00 | `unit_tests/coupon-member-pricing.test.ts` | 2dp rounding |
| Member pricing: 0% → unchanged | `unit_tests/coupon-member-pricing.test.ts` | passthrough |
| Member pricing: 100% → $0.00 | `unit_tests/coupon-member-pricing.test.ts` | full discount |
| Coupon percentage: 10% off $100 → $10 | `unit_tests/coupon-member-pricing.test.ts` | applicable=true |
| Coupon fixed: $5 off $100 → $5 | `unit_tests/coupon-member-pricing.test.ts` | fixed amount |
| Coupon fixed: $5 off $3 → capped at $3 | `unit_tests/coupon-member-pricing.test.ts` | no discount > total |
| minOrderAmount guard: below min → not applied | `unit_tests/coupon-member-pricing.test.ts` | applicable=false |
| minOrderAmount: at threshold → applied | `unit_tests/coupon-member-pricing.test.ts` | applicable=true |
| Expired coupon → not applied | `unit_tests/coupon-member-pricing.test.ts` | applicable=false |
| Inactive coupon → not applied | `unit_tests/coupon-member-pricing.test.ts` | applicable=false |
| Max redemptions reached → not applied | `unit_tests/coupon-member-pricing.test.ts` | applicable=false |
| Growth points: $50 → 50 pts | `unit_tests/growth-points.test.ts` | 1 pt per $1 |
| Growth points: $0.99 → 0 pts (floor) | `unit_tests/growth-points.test.ts` | no rounding up |
| Growth points: $50.75 → 50 pts | `unit_tests/growth-points.test.ts` | fractional floor |
| Tier upgrade: at threshold → eligible | `unit_tests/growth-points.test.ts` | isEligibleForUpgrade |
| Tier upgrade: below threshold → not eligible | `unit_tests/growth-points.test.ts` | boundary |
| Top tier (null threshold) → never upgrade | `unit_tests/growth-points.test.ts` | null guard |
| Wallet top-up: $0 → $50 → balanceAfter=$50 | `unit_tests/wallet-ledger.test.ts` | balanceBefore/After |
| Wallet spend: $50 → $20 → balanceAfter=$30 | `unit_tests/wallet-ledger.test.ts` | spend |
| Wallet spend > balance → error | `unit_tests/wallet-ledger.test.ts` | insufficient balance |
| Wallet refund: $30 → $40 | `unit_tests/wallet-ledger.test.ts` | refund adds |
| Ledger is append-only (immutable entries) | `unit_tests/wallet-ledger.test.ts` | new object returned |
| `POST .../wallet/topup` → 200 + ledger + receipt | `api_tests/memberships.api.test.ts` | entryType='TOPUP' |
| `POST .../wallet/topup` (missing amount) → 400 | `api_tests/memberships.api.test.ts` | VALIDATION_ERROR |
| `POST .../wallet/spend` (insufficient) → 422 | `api_tests/memberships.api.test.ts` | UNPROCESSABLE |
| `POST .../fulfillments` (valid coupon) → discount applied | `api_tests/memberships.api.test.ts` | discountAmount > 0 |
| `POST .../fulfillments` (expired coupon) → 422 | `api_tests/memberships.api.test.ts` | error surfaced |
| Fulfillment idempotent by key | `api_tests/memberships.api.test.ts` | same id both calls |
| Fulfillment idempotent by key (DB-backed service path) | `api_tests/integration/memberships-fulfillment.integration.test.ts` | duplicate POST reuses the same fulfillment record |
| Fulfillment detail is org-scoped | `api_tests/memberships.api.test.ts` | same-org 200, cross-org 404 |
| Fulfillment detail org-scope enforced (DB-backed) | `api_tests/integration/memberships-fulfillment.integration.test.ts` | same-org 200, cross-org 404 on `/api/members/fulfillments/:id` |
| `GET /api/orgs/:orgId/membership-tiers` → 200 + tiers list | `api_tests/memberships.api.test.ts` | tier array in response |
| `POST /api/orgs/:orgId/membership-tiers` (Administrator) → 201 | `api_tests/memberships.api.test.ts` | tier created |
| `POST /api/orgs/:orgId/membership-tiers` (non-Administrator) → 403 | `api_tests/memberships.api.test.ts` | role gate |
| `POST /api/orgs/:orgId/membership-tiers` (empty benefits) → 400 | `api_tests/memberships.api.test.ts` | VALIDATION_ERROR |
| `POST /api/orgs/:orgId/members` (valid) → 201 | `api_tests/memberships.api.test.ts` | member record returned |
| `POST /api/orgs/:orgId/members` (missing tierId) → 400 | `api_tests/memberships.api.test.ts` | VALIDATION_ERROR |
| `POST /api/orgs/:orgId/members` (no write:memberships) → 403 | `api_tests/memberships.api.test.ts` | permission gate |
| `POST /api/orgs/:orgId/coupons` (OpsManager) → 201 | `api_tests/memberships.api.test.ts` | coupon created |
| `POST /api/orgs/:orgId/coupons` (lowercase code) → 400 | `api_tests/memberships.api.test.ts` | regex validation fails |
| `POST /api/orgs/:orgId/coupons` (ineligible role) → 403 | `api_tests/memberships.api.test.ts` | role gate |
| `GET /api/members/:id` (same org) → 200 | `api_tests/memberships.api.test.ts` | member detail returned |
| `GET /api/members/:id` (not found) → 404 | `api_tests/memberships.api.test.ts` | NOT_FOUND |
| `GET /api/members/:id` (cross-org) → 404 | `api_tests/memberships.api.test.ts` | org isolation |
| `GET /api/members/:id/wallet` → 200 + decrypted balance | `api_tests/memberships.api.test.ts` | encrypted balance parsed |
| `GET /api/members/:id/wallet` (no wallet) → 404 | `api_tests/memberships.api.test.ts` | wallet absent → NOT_FOUND |
| `GET /api/members/:id/wallet` (cross-org) → 404 | `api_tests/memberships.api.test.ts` | org isolation |
| Auditor read-only wallet | `frontend/unit_tests/memberships-view.test.ts` | no top-up/spend UI |
| OpsManager wallet controls | `frontend/unit_tests/memberships-view.test.ts` | top-up form present |
| Fulfillment form validates line items | `frontend/unit_tests/memberships-view.test.ts` | error on empty items |
| Coupon code passed to service | `frontend/unit_tests/memberships-view.test.ts` | couponCode in payload |
| DB-backed member list is org-scoped | `api_tests/integration/logistics-memberships-api.integration.test.ts` | same-org returns only own member |
| DB-backed member list enforces read permission | `api_tests/integration/logistics-memberships-api.integration.test.ts` | missing `read:memberships` returns 403 |
| `createFulfillment`: returns existing fulfillment when idempotency key already used | `unit_tests/memberships-service-unit.test.ts` | `createFulfillmentRequest` not called |
| Guest checkout computes `totalAmount` with no member pricing applied | `unit_tests/memberships-service-unit.test.ts` | `discountAmount=0`, `shippingFee=0` |
| Throws NotFoundError when memberId refers to missing member | `unit_tests/memberships-service-unit.test.ts` | `createFulfillmentRequest` not called |
| Rejects cross-org member as NotFoundError | `unit_tests/memberships-service-unit.test.ts` | different `orgId` rejected |
| Applies member pricing rule when `itemCategory` matches; earns growth points | `unit_tests/memberships-service-unit.test.ts` | `memberPrice`, `addPointTransaction` called |
| Does not apply pricing when `itemCategory` matches no rule | `unit_tests/memberships-service-unit.test.ts` | `memberPrice=undefined` |
| Throws NotFoundError when coupon code not found | `unit_tests/memberships-service-unit.test.ts` | rejected before fulfillment |
| Throws Unprocessable when coupon inactive, expired, or redemption cap reached | `unit_tests/memberships-service-unit.test.ts` | each validation guard |
| Throws Unprocessable when coupon restricted to different tier | `unit_tests/memberships-service-unit.test.ts` | `tierId` mismatch |
| Throws Unprocessable when `totalAmount` below `minOrderAmount` | `unit_tests/memberships-service-unit.test.ts` | order minimum guard |
| Applies percentage coupon; increments redemption and creates redemption record | `unit_tests/memberships-service-unit.test.ts` | `discountAmount=10%`, `incrementCouponRedemption` called |
| Applies fixed-amount coupon capped at `totalAmount` (prevents negative finalAmount) | `unit_tests/memberships-service-unit.test.ts` | `discountAmount` capped |
| Throws Unprocessable when shipping ZIP not serviceable | `unit_tests/memberships-service-unit.test.ts` | `isZipServiceable=false` |
| Skips shipping when `shippingZipCode`/`shippingTier` not provided | `unit_tests/memberships-service-unit.test.ts` | `shippingFee=0` |
| Applies template-based shipping fee when zip is serviceable | `unit_tests/memberships-service-unit.test.ts` | `shippingFee > 0` |
| Falls back to `shippingFee=0` when no matching template | `unit_tests/memberships-service-unit.test.ts` | null template → zero fee |
| Rejects `useWallet=true` when `storedValueEnabled=false` | `unit_tests/memberships-service-unit.test.ts` | Unprocessable |
| Spends from wallet up to balance; links wallet ledger entry to receipt | `unit_tests/memberships-service-unit.test.ts` | `spendFromWallet` called, receipt has `walletLedgerEntryId` |
| Creates basic receipt without wallet spend when wallet disabled | `unit_tests/memberships-service-unit.test.ts` | `spendFromWallet` not called |
| `topUpWallet`: creates wallet on first top-up when none exists | `unit_tests/memberships-service-unit.test.ts` | `createWallet` called |
| `topUpWallet`: throws NotFoundError when first top-up has no member | `unit_tests/memberships-service-unit.test.ts` | null member |
| `topUpWallet`: throws Unprocessable when wallet disabled | `unit_tests/memberships-service-unit.test.ts` | `isEnabled=false` |
| `topUpWallet`: tops up existing enabled wallet | `unit_tests/memberships-service-unit.test.ts` | `topUpWallet` repo called |
| `spendFromWallet`: throws NotFoundError when wallet not found | `unit_tests/memberships-service-unit.test.ts` | null wallet |
| `spendFromWallet`: creates a receipt after successful spend | `unit_tests/memberships-service-unit.test.ts` | `createReceipt` called |
| `upgradeIfEligible`: returns silently when member not found or already at top tier | `unit_tests/memberships-service-unit.test.ts` | `updateMemberTier` not called |
| `upgradeIfEligible`: upgrades when `growthPoints` meets/exceeds next tier threshold | `unit_tests/memberships-service-unit.test.ts` | `updateMemberTier` called |

---

## 9. Import / Export & Row Validation

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| Valid student row → 0 errors | `unit_tests/import-row-validation.test.ts` | empty error array |
| Missing firstName → error for firstName | `unit_tests/import-row-validation.test.ts` | field='firstName' |
| Invalid email → error for email | `unit_tests/import-row-validation.test.ts` | field='email' |
| studentNumber > 50 chars → error | `unit_tests/import-row-validation.test.ts` | field='studentNumber' |
| Multiple bad fields → multiple errors | `unit_tests/import-row-validation.test.ts` | length ≥ 2 |
| Error includes rawValue | `unit_tests/import-row-validation.test.ts` | rawValue='bad-email' |
| Row N failure doesn't stop row N+1 | `unit_tests/import-row-validation.test.ts` | independent validation |
| Optional email field absent → no error | `unit_tests/import-row-validation.test.ts` | optional field |
| Receipt: starts with RCP- | `unit_tests/export-metadata.test.ts` | format check |
| Receipt: contains current year | `unit_tests/export-metadata.test.ts` | year in string |
| Receipt numbers unique | `unit_tests/export-metadata.test.ts` | two calls differ |
| Receipt format RCP-YYYY-XXXXXXXX | `unit_tests/export-metadata.test.ts` | regex match |
| Export job: pending → processing → completed | `unit_tests/export-metadata.test.ts` | status transitions |
| Export completedAt set | `unit_tests/export-metadata.test.ts` | timestamp present |
| `POST /api/orgs/:orgId/import` → 202 + importJobId | `api_tests/import-export.api.test.ts` | jobId returned |
| Invalid entityType → 400 VALIDATION_ERROR | `api_tests/import-export.api.test.ts` | unknown_type rejected |
| `enqueueJob` called with correct payload | `api_tests/import-export.api.test.ts` | importJobId + orgId |
| Import job with failedRows → errorReportAssetId | `api_tests/import-export.api.test.ts` | partial_success job |
| Import job not found → 404 | `api_tests/import-export.api.test.ts` | null job → 404 |
| Import job is org-scoped | `api_tests/import-export.api.test.ts` | cross-org request → 404 |
| `POST /api/orgs/:orgId/export` → 202 + exportJobId | `api_tests/import-export.api.test.ts` | jobId returned |
| Export invalid entityType → 400 | `api_tests/import-export.api.test.ts` | 'transactions' rejected |
| Export completed → fileAssetId set | `api_tests/import-export.api.test.ts` | status='completed' |
| Export in-progress → fileAssetId null | `api_tests/import-export.api.test.ts` | status='processing' |
| Export job is org-scoped | `api_tests/import-export.api.test.ts` | cross-org request → 404 |
| `ExportWorker`: exposes `export` as worker type | `unit_tests/export-worker.test.ts` | `worker.type` value |
| Writes CSV for students and transitions job `processing` → `completed` | `unit_tests/export-worker.test.ts` | both `exportJob.update` calls checked |
| CSV escapes quotes, commas, and embedded newlines | `unit_tests/export-worker.test.ts` | `"Jo, Jr."` and `O""Brien` in output |
| Writes empty CSV when export produces no rows | `unit_tests/export-worker.test.ts` | `writeFileSync` called with `''` |
| Delegates to `exportDepartments`, `exportCourses`, `exportSemesters` per entity type | `unit_tests/export-worker.test.ts` | only correct service function called |
| Marks job `failed` and skips file write for unsupported entity types | `unit_tests/export-worker.test.ts` | `writeFileSync` not called |
| Creates `FileAsset` linked to job creator's `userId` | `unit_tests/export-worker.test.ts` | `uploadedByUserId` = `createdByUserId` |
| `ImportWorker`: exposes `import` as worker type | `unit_tests/import-worker.test.ts` | `worker.type` value |
| Imports students from inline payload rows and marks job `success` when all rows pass | `unit_tests/import-worker.test.ts` | `status='success'`, `importRowError.createMany` not called |
| Marks `partial_success` and writes error-report CSV when some rows fail | `unit_tests/import-worker.test.ts` | `importRowError.createMany` called, CSV contains `Row,Field,Error` header |
| Marks `failed` when every row is rejected | `unit_tests/import-worker.test.ts` | `status='failed'`, `successRows=0` |
| Loads rows from CSV `FileAsset` when no inline rows provided | `unit_tests/import-worker.test.ts` | `readFileSync` called; service receives parsed rows |
| Warns and treats rows as empty when file asset not found on disk | `unit_tests/import-worker.test.ts` | `readFileSync` not called; empty import succeeds |
| Marks job `failed` for unsupported entity types | `unit_tests/import-worker.test.ts` | no importer called |
| Delegates to `importClasses`, `importDepartments`, `importCourses`, `importSemesters` | `unit_tests/import-worker.test.ts` | entity-type routing |
| Error-report CSV escapes embedded quotes in field values | `unit_tests/import-worker.test.ts` | `""quote""` and `""hi""` doubled |

---

## 10. Observability — Metrics, Logs, Alerts, Notifications

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| Threshold operator validation | `unit_tests/observability-threshold.test.ts` | gt/lt/gte/lte valid |
| Invalid operator → rejected | `unit_tests/observability-threshold.test.ts` | INVALID fails |
| `GET /api/observability/metrics` → 200 | `api_tests/observability.api.test.ts` | p95Latency, cpuUtilization |
| `POST /api/observability/metrics` → 202 | `api_tests/observability.api.test.ts` | Accepted (async job) |
| `POST .../metrics` (missing metricName) → 400 | `api_tests/observability.api.test.ts` | VALIDATION_ERROR |
| `GET /api/observability/logs` → 200 | `api_tests/observability.api.test.ts` | logs + total |
| `POST /api/observability/thresholds` → 201 | `api_tests/observability.api.test.ts` | threshold created |
| `POST .../thresholds` (invalid operator) → 400 | `api_tests/observability.api.test.ts` | VALIDATION_ERROR |
| `DELETE /api/observability/thresholds/:id` → 204 | `api_tests/observability.api.test.ts` | no body |
| `DELETE .../thresholds` (not found) → 404 | `api_tests/observability.api.test.ts` | NOT_FOUND |
| `GET /api/observability/alerts` → 200 + events | `api_tests/observability.api.test.ts` | data.events array |
| `POST .../alerts/:id/acknowledge` → 200 | `api_tests/observability.api.test.ts` | userId passed |
| `GET /api/observability/thresholds` → 200 + thresholds scoped to org | `api_tests/observability.api.test.ts` | `listAlertThresholds` called with orgId |
| `GET /api/observability/thresholds` (no read:observability) → 403 | `api_tests/observability.api.test.ts` | permission gate |
| `PATCH /api/observability/thresholds/:id` (OpsManager) → 200 | `api_tests/observability.api.test.ts` | `updateAlertThreshold` called with id + body + orgId |
| `PATCH /api/observability/thresholds/:id` (empty body) → 400 | `api_tests/observability.api.test.ts` | VALIDATION_ERROR |
| `PATCH /api/observability/thresholds/:id` (not found) → 404 | `api_tests/observability.api.test.ts` | NotFoundError mapped |
| `PATCH /api/observability/thresholds/:id` (ineligible role) → 403 | `api_tests/observability.api.test.ts` | role gate |
| `GET /api/observability/notifications` → 200 + list | `api_tests/observability.api.test.ts` | `listNotifications` returns data |
| `GET /api/observability/notifications` (unreadOnly=true) → forwards flag | `api_tests/observability.api.test.ts` | `unreadOnly: true` passed through |
| `GET /api/observability/notifications` (no read:observability) → 403 | `api_tests/observability.api.test.ts` | permission gate |
| `POST /api/observability/notifications/:id/read` → 200 + marked read | `api_tests/observability.api.test.ts` | `markNotificationRead` called |
| `POST /api/observability/notifications/:id/read` (not found) → 404 | `api_tests/observability.api.test.ts` | NotFoundError mapped |
| `POST /api/observability/notifications/:id/read` (no write:observability) → 403 | `api_tests/observability.api.test.ts` | permission gate |
| ObservabilityView: 4 tabs rendered | `frontend/unit_tests/observability-view.test.ts` | Metrics/Logs/Alerts/Notifs |
| Metrics tab: KPI cards show values | `frontend/unit_tests/observability-view.test.ts` | p95, cpu values |
| Metrics fetch error → error state | `frontend/unit_tests/observability-view.test.ts` | error message shown |
| Logs tab: level filter + search | `frontend/unit_tests/observability-view.test.ts` | inputs present |
| Log entries rendered in table | `frontend/unit_tests/observability-view.test.ts` | message text visible |
| Alerts tab: alert events shown | `frontend/unit_tests/observability-view.test.ts` | data-testid matches |
| Ack button for unacknowledged + write permission | `frontend/unit_tests/observability-view.test.ts` | button present |
| Ack button hidden for already-ack'd alert | `frontend/unit_tests/observability-view.test.ts` | button absent |
| Add Threshold button: OpsManager → visible | `frontend/unit_tests/observability-view.test.ts` | button present |
| Add Threshold button: Auditor → hidden | `frontend/unit_tests/observability-view.test.ts` | button absent |
| Threshold panel opens on Add Threshold click | `frontend/unit_tests/observability-view.test.ts` | side-panel visible |
| createThreshold called with correct data | `frontend/unit_tests/observability-view.test.ts` | metricName + operator |
| Notifications tab: cards rendered | `frontend/unit_tests/observability-view.test.ts` | data-testid present |
| Mark read button for unread notification | `frontend/unit_tests/observability-view.test.ts` | button present |
| Mark read button hidden for read notification | `frontend/unit_tests/observability-view.test.ts` | button absent |
| Audible notification increase triggers in-app cue | `frontend/unit_tests/observability-view.test.ts` | `AudioContext` invoked when unread audible count rises |
| `recordMetric`: inserts metric; no alert when no active thresholds | `unit_tests/observability-service-unit.test.ts` | `createAlertEvent` not called |
| `recordMetric`: passes optional `orgId` through to `insertMetric` | `unit_tests/observability-service-unit.test.ts` | `orgId` field present |
| `recordMetric`: does NOT trigger alert when value doesn't satisfy operator | `unit_tests/observability-service-unit.test.ts` | `createNotification` not called |
| `recordMetric`: creates banner notification when non-error_rate threshold triggered | `unit_tests/observability-service-unit.test.ts` | `type='banner'`, message contains metric name |
| `recordMetric`: creates BOTH banner AND audible notifications for `error_rate` threshold | `unit_tests/observability-service-unit.test.ts` | `createNotification` called twice |
| `recordMetric`: forwards threshold `orgId` to `createAlertEvent` and `createNotification` | `unit_tests/observability-service-unit.test.ts` | org-scoped alert |
| `recordMetric`: evaluates all matching thresholds independently in one call | `unit_tests/observability-service-unit.test.ts` | 2 of 3 triggered |
| `getMetricsSummary`: returns null fields when no metrics recorded | `unit_tests/observability-service-unit.test.ts` | all null |
| `getMetricsSummary`: maps p95_latency, cpu/gpu_utilization, error_rate to summary fields | `unit_tests/observability-service-unit.test.ts` | correct field mapping |
| `getMetricsSummary`: ignores unknown metric names without throwing | `unit_tests/observability-service-unit.test.ts` | no error |
| `searchLogs`: passes pagination defaults (page=1, limit=50) to repo | `unit_tests/observability-service-unit.test.ts` | defaults enforced |
| `createAlertThreshold`: forwards data + orgId to repo | `unit_tests/observability-service-unit.test.ts` | orgId included |
| `updateAlertThreshold` / `deleteAlertThreshold`: forward id, payload, orgId | `unit_tests/observability-service-unit.test.ts` | repo called correctly |
| `listAlertEvents`: maps rows to `AlertEventResponse` with ISO timestamps | `unit_tests/observability-service-unit.test.ts` | timestamp strings, null for unacknowledged |
| `listNotifications`: passes `unreadOnly` + `orgId` to repo | `unit_tests/observability-service-unit.test.ts` | default `unreadOnly=false` |
| `markNotificationRead`: forwards id and orgId | `unit_tests/observability-service-unit.test.ts` | repo called |

---

## 11. Configuration & Backups

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| DEFAULT_CONFIG values | `unit_tests/config-validation.test.ts` | heartbeat=120, logRetention=30 |
| `applyConfigUpdate` partial override | `unit_tests/config-validation.test.ts` | other fields unchanged |
| `_resetOverrides` restores defaults | `unit_tests/config-validation.test.ts` | heartbeat back to 120 |
| updatedAt changes after override | `unit_tests/config-validation.test.ts` | timestamp comparison |
| storagePath not overridable at runtime | `unit_tests/config-validation.test.ts` | env-only field |
| `BACKUP_RETENTION_DAYS` = 14 | `unit_tests/backup-retention.test.ts` | value check |
| expiresAt = startedAt + 14 days | `unit_tests/backup-retention.test.ts` | math check |
| Backup from 15 days ago is expired | `unit_tests/backup-retention.test.ts` | expiresAt in past |
| Backup from 13 days ago is not expired | `unit_tests/backup-retention.test.ts` | expiresAt in future |
| Only completed backups eligible for restore | `unit_tests/backup-retention.test.ts` | running/failed → false |
| `GET /api/config` → 200 | `api_tests/config.api.test.ts` | config + updatedAt |
| `PATCH /api/config` (Administrator) → 200 | `api_tests/config.api.test.ts` | updateConfig called |
| `PATCH /api/config` (Auditor) → 403 | `api_tests/config.api.test.ts` | role gate |
| `PATCH /api/config` (negative value) → 400 | `api_tests/config.api.test.ts` | VALIDATION_ERROR |
| `PATCH /api/config` (boolean as string) → 400 | `api_tests/config.api.test.ts` | type validation |
| `GET /api/config` no-mock integration path returns config envelope | `api_tests/integration/config-api.integration.test.ts` | success + config payload |
| `PATCH /api/config` no-mock integration updates runtime config | `api_tests/integration/config-api.integration.test.ts` | updated fields returned |
| `PATCH /api/config` no-mock integration enforces admin-only writes | `api_tests/integration/config-api.integration.test.ts` | non-admin write returns 403 |
| Partial PATCH only changes given fields | `api_tests/config.api.test.ts` | single field update |
| `POST /api/backups` → 202 | `api_tests/backups.api.test.ts` | backup enqueued |
| `GET /api/backups` → 200 + list | `api_tests/backups.api.test.ts` | array in response |
| `POST /api/backups/:id/restore` → 202 | `api_tests/backups.api.test.ts` | restore enqueued |
| Config tab: loads and displays values | `frontend/unit_tests/admin-config-backups.test.ts` | input values set |
| Save Changes: Administrator → patch called | `frontend/unit_tests/admin-config-backups.test.ts` | patch('/config') |
| Save Changes button hidden for Auditor | `frontend/unit_tests/admin-config-backups.test.ts` | button absent |
| Inputs disabled for Auditor | `frontend/unit_tests/admin-config-backups.test.ts` | disabled attr |
| Read-only notice for non-Administrator | `frontend/unit_tests/admin-config-backups.test.ts` | text 'Read-only' |
| Backups tab: lists backups | `frontend/unit_tests/admin-config-backups.test.ts` | completed + running visible |
| Trigger Backup: Administrator only | `frontend/unit_tests/admin-config-backups.test.ts` | button visibility |
| Restore button: only for completed backups | `frontend/unit_tests/admin-config-backups.test.ts` | running → no button |
| Restore button: Administrator only | `frontend/unit_tests/admin-config-backups.test.ts` | OpsManager → hidden |
| `triggerBackup`: defaults to FULL backup type with date-prefixed storage path | `unit_tests/backups-service-unit.test.ts` | path matches `/YYYY-MM-DD$` |
| `triggerBackup`: passes explicit backup type to repo and job payload | `unit_tests/backups-service-unit.test.ts` | `'incremental'` forwarded |
| `listBackups`: maps records to `BackupRecordResponse` with ISO timestamps; BigInt serialized as string | `unit_tests/backups-service-unit.test.ts` | `sizeBytes` is string |
| `listBackups`: returns `[]` when no backup records exist | `unit_tests/backups-service-unit.test.ts` | empty array |
| `getBackupById`: returns null when backup not found | `unit_tests/backups-service-unit.test.ts` | null passthrough |
| `getBackupById`: parses JSON `verificationResult` and formats `performedBy` username | `unit_tests/backups-service-unit.test.ts` | parsed object, null fallback |
| `triggerRestore`: creates restore run and enqueues restore job | `unit_tests/backups-service-unit.test.ts` | `enqueueJob('restore', ...)` called |
| `listRestoreRuns`: maps with username fallback to `performedByUserId` when `performedBy` is null | `unit_tests/backups-service-unit.test.ts` | fallback to user ID string |
| `LogRetentionWorker`: deletes logs older than configured retention cutoff | `unit_tests/log-retention-worker.test.ts` | cutoff ≈ now − `logRetentionDays` |
| Honors custom retention window from configuration (`logRetentionDays=7`) | `unit_tests/log-retention-worker.test.ts` | 7-day cutoff computed |
| Exposes `log_retention` as worker type | `unit_tests/log-retention-worker.test.ts` | `worker.type` value |
| Completes successfully when no rows are deleted | `unit_tests/log-retention-worker.test.ts` | resolves undefined |

---

## 12. Security & Cryptography

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| AES-256-GCM encrypt/decrypt round-trip | `unit_tests/aes256-encryption.test.ts` | plaintext recovered |
| Different inputs → different ciphertext | `unit_tests/aes256-encryption.test.ts` | ciphertext differs |
| Tampered ciphertext → decrypt fails | `unit_tests/aes256-encryption.test.ts` | error thrown |
| HMAC sign/verify round-trip | `unit_tests/api-signing.test.ts` | verifySignature=true |
| Tampered payload → verify fails | `unit_tests/api-signing.test.ts` | verifySignature=false |
| Wrong secret → verify fails | `unit_tests/api-signing.test.ts` | false |
| Production startup enforces TLS cert/key presence | `unit_tests/tls-enforcement.test.ts` | checks production guard and `https.createServer` path |
| Timestamp >5 min past → fails | `unit_tests/api-signing.test.ts` | replay protection |
| Timestamp >5 min future → fails | `unit_tests/api-signing.test.ts` | clock skew protection |
| Within 2-min window → passes | `unit_tests/api-signing.test.ts` | true |
| Short signature (length check) → false | `unit_tests/api-signing.test.ts` | short-circuit before timingSafeEqual |
| `generateSigningSecret()` → 64-char hex | `unit_tests/api-signing.test.ts` | unique each call |
| Password hash verify (bcrypt) | `unit_tests/password-hashing.test.ts` | round-trip |

---

## 13. Circuit Breaker & Resilience

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| CircuitBreaker starts CLOSED | `unit_tests/circuit-breaker.test.ts` | state='CLOSED' |
| Failures below threshold → CLOSED | `unit_tests/circuit-breaker.test.ts` | failureCount increments |
| Failures at threshold → OPEN | `unit_tests/circuit-breaker.test.ts` | state='OPEN' |
| Success in CLOSED resets failureCount | `unit_tests/circuit-breaker.test.ts` | count=0 |
| OPEN → rejects with CircuitOpenError | `unit_tests/circuit-breaker.test.ts` | instanceof check |
| After openTimeoutMs → HALF_OPEN | `unit_tests/circuit-breaker.test.ts` | fake timers |
| Success in HALF_OPEN → CLOSED | `unit_tests/circuit-breaker.test.ts` | state='CLOSED' |
| Failure in HALF_OPEN → OPEN | `unit_tests/circuit-breaker.test.ts` | state='OPEN' |
| `reset()` force-transitions to CLOSED | `unit_tests/circuit-breaker.test.ts` | count=0 |
| Registry singleton: same key → same instance | `unit_tests/circuit-breaker.test.ts` | cb1 === cb2 |
| Registry: new key → creates breaker | `unit_tests/circuit-breaker.test.ts` | instanceof CircuitBreaker |

---

## 14. Job Worker State Transitions

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| null payload → `{}` | `unit_tests/job-worker-transitions.test.ts` | parsePayload(null) |
| JSON payload parsed correctly | `unit_tests/job-worker-transitions.test.ts` | fields accessible |
| `pending` + remaining attempts → can be claimed | `unit_tests/job-worker-transitions.test.ts` | canClaim=true |
| `processing` job → cannot be claimed | `unit_tests/job-worker-transitions.test.ts` | canClaim=false |
| `failed` job → cannot be claimed | `unit_tests/job-worker-transitions.test.ts` | canClaim=false |
| failedAttempts=maxAttempts → cannot be claimed | `unit_tests/job-worker-transitions.test.ts` | exhausted guard |
| `pending` → `processing` on claim | `unit_tests/job-worker-transitions.test.ts` | status change |
| `processing` → `completed` on complete | `unit_tests/job-worker-transitions.test.ts` | completedAt set |
| First failure → status stays `pending` (retry) | `unit_tests/job-worker-transitions.test.ts` | failedAttempts=1 |
| Failure at maxAttempts → `failed` permanently | `unit_tests/job-worker-transitions.test.ts` | status='failed' |
| failedAttempts increments by 1 each time | `unit_tests/job-worker-transitions.test.ts` | counter check |
| maxAttempts=1 → single failure marks failed | `unit_tests/job-worker-transitions.test.ts` | immediate terminal |
| Full lifecycle: pending→processing→completed | `unit_tests/job-worker-transitions.test.ts` | scenario test |
| Retry lifecycle: fail→retry→complete | `unit_tests/job-worker-transitions.test.ts` | scenario test |

---

## 15. Error Envelopes & Validation Contracts

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| Error envelope: `success=false`, `error.code` | `api_tests/error-envelope.contract.test.ts` | shape check |
| VALIDATION_ERROR has `details` object | `api_tests/validation-errors.contract.test.ts` | field errors present |
| Zod enum validation (valid/invalid values) | `unit_tests/enum-validation.test.ts` | enum acceptance |
| Pagination schema (page/limit ranges) | `unit_tests/validation-schemas.test.ts` | min/max bounds |

---

## 16. Frontend — General UI Contracts

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| AppDataTable: search filters rows | `frontend/unit_tests/data-table.test.ts` | filtered results |
| AppDataTable: column sorting | `frontend/unit_tests/data-table.test.ts` | sort direction toggle |
| LoadingSpinner shown during fetch | `frontend/unit_tests/loading-error-states.test.ts` | spinner visible |
| ErrorState shown on API error | `frontend/unit_tests/loading-error-states.test.ts` | error message rendered |
| EmptyState shown on empty list | `frontend/unit_tests/loading-error-states.test.ts` | empty state rendered |
| Poll composable: calls fn on interval | `frontend/unit_tests/poll.test.ts` | fake timers check |
| Poll composable: stops on unmount | `frontend/unit_tests/poll.test.ts` | no calls after stop |
| API client: attaches Bearer token | `frontend/unit_tests/api-client.test.ts` | Authorization header |
| API client: normalizes error to ApiError | `frontend/unit_tests/api-client.test.ts` | error.code present |
| Dashboard: time-range filter changes payload | `frontend/unit_tests/dashboard-filters.test.ts` | filter in query |
| NavLayout: role-gated nav items | `frontend/unit_tests/layout-nav.test.ts` | Auditor sees subset |
| Permissions helper: hasPermission | `frontend/unit_tests/permissions.test.ts` | string match |
| Domain types: enums defined | `frontend/unit_tests/domain-types.test.ts` | enum values |
| Admin view: 5 tabs visible | `frontend/unit_tests/admin-view.test.ts` | Students/Import/Export/Config/Backups |

---

## 17. File Access & Storage

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| File download is denied for cross-org access | `api_tests/files.api.test.ts` | GET `/api/files/:id` returns 404 NOT_FOUND |
| Missing file on disk returns NOT_FOUND envelope | `api_tests/files.api.test.ts` | absent storage path maps to 404 |
| Upload rejects unsupported MIME type with validation envelope | `api_tests/files.api.test.ts` | POST `/api/files` text/plain returns 400 VALIDATION_ERROR |
| Upload rejects oversize payload with validation envelope | `api_tests/files.api.test.ts` | POST `/api/files` >10MB returns 400 VALIDATION_ERROR |

---

## 18. Master Data — Organizations, Campuses, Students & Academic Data

| Requirement | Test File | Key Assertions |
|------------|-----------|---------------|
| `GET /api/orgs` (no token) → 401 UNAUTHORIZED | `api_tests/master-data-orgs.api.test.ts` | unauthenticated request rejected |
| `GET /api/orgs` (Administrator) → 200, all orgs | `api_tests/master-data-orgs.api.test.ts` | `listOrgs(undefined)` — no org filter |
| `GET /api/orgs` (OpsManager) → 200, org-scoped | `api_tests/master-data-orgs.api.test.ts` | `listOrgs(orgId)` — caller's org only |
| `GET /api/orgs` (OpsManager, no orgId in token) → 401 | `api_tests/master-data-orgs.api.test.ts` | missing org context rejected |
| `GET /api/orgs/:orgId` → 200 with org details | `api_tests/master-data.api.test.ts` | `findOrgById` result in envelope |
| `GET /api/orgs/:orgId/campuses` → 200 with campus list | `api_tests/master-data.api.test.ts` | `findCampusesByOrg` result |
| `GET /api/orgs/:orgId/students` → 200 paginated | `api_tests/master-data.api.test.ts` | `data.total` present |
| `POST /api/orgs/:orgId/students` → 201 with student record | `api_tests/master-data.api.test.ts` | `studentNumber` in response |
| `GET /api/orgs/:orgId/students/:id` → 200 with details | `api_tests/master-data.api.test.ts` | `getStudentById` forwarded |
| `PATCH /api/orgs/:orgId/students/:id` → 200 with updates | `api_tests/master-data.api.test.ts` | updated field returned |
| `GET /api/orgs/:orgId/departments` → 200 with departments | `api_tests/master-data.api.test.ts` | list in envelope |
| `POST /api/orgs/:orgId/departments` → 201 with department | `api_tests/master-data.api.test.ts` | `code` in response |
| `POST /api/orgs/:orgId/courses` → 201 with course | `api_tests/master-data.api.test.ts` | `code` in response |
| `GET /api/orgs/:orgId/semesters` → 200 with semesters | `api_tests/master-data.api.test.ts` | list in envelope |
| `POST /api/orgs/:orgId/semesters` (OpsManager) → 201 | `api_tests/master-data.api.test.ts` | `name` in response |
| `POST /api/orgs/:orgId/classes` → 201 with class | `api_tests/master-data.api.test.ts` | `section` in response |
| `getStudentById`: returns student when found | `unit_tests/master-data-service-unit.test.ts` | result passed through |
| `getStudentById`: throws NotFoundError when student not found | `unit_tests/master-data-service-unit.test.ts` | null → error |
| `importStudents`: upserts every valid row and reports `successCount` | `unit_tests/master-data-service-unit.test.ts` | `upsertStudentByNumber` called per row |
| `importStudents`: emits `failedRow` per missing required field via Zod | `unit_tests/master-data-service-unit.test.ts` | `field='studentNumber'`, `rowNumber=1` |
| `importStudents`: captures repository upsert errors as `failedRows` | `unit_tests/master-data-service-unit.test.ts` | DB error surfaced with `rawValue` |
| `importStudents`: mixes valid and invalid rows in single batch | `unit_tests/master-data-service-unit.test.ts` | `successCount=2`, `failedRows=[row2]` |
| `importStudents`: `rawValue=null` when failing field absent from row | `unit_tests/master-data-service-unit.test.ts` | null not empty string |
| `importClasses`: flags missing `courseId`/`semesterId`/`section` before any DB lookup | `unit_tests/master-data-service-unit.test.ts` | repo not called |
| `importClasses`: flags row when course or semester not found | `unit_tests/master-data-service-unit.test.ts` | `field='courseId'`/`'semesterId'` |
| `importClasses`: default capacity is 30 when omitted | `unit_tests/master-data-service-unit.test.ts` | `capacity=30` in `createClass` call |
| `importClasses`: captures duplicate-class errors at `section` field | `unit_tests/master-data-service-unit.test.ts` | UNIQUE constraint → failedRow |
| `importDepartments`: flags missing `campusId`/`name`/`code` | `unit_tests/master-data-service-unit.test.ts` | repo not called |
| `importDepartments`: creates department when all fields present | `unit_tests/master-data-service-unit.test.ts` | `successCount=1` |
| `importDepartments`: captures duplicate-department errors at `code` field | `unit_tests/master-data-service-unit.test.ts` | UNIQUE → failedRow |
| `importCourses`: flags missing `deptId`/`name`/`code`; flags row when department missing | `unit_tests/master-data-service-unit.test.ts` | repo not called on missing fields |
| `importSemesters`: flags missing `name`/`startDate`/`endDate` | `unit_tests/master-data-service-unit.test.ts` | `createSemester` not called |
| `importSemesters`: creates semester when all fields present | `unit_tests/master-data-service-unit.test.ts` | `successCount=1` |
| `exportStudents`: projects each student to export row shape; null email → empty string | `unit_tests/master-data-service-unit.test.ts` | ISO timestamps, null→`''` |
| `exportDepartments`: flattens all departments across every campus in the org | `unit_tests/master-data-service-unit.test.ts` | 3 departments from 2 campuses |
| `exportDepartments`: returns `[]` when org has no campuses | `unit_tests/master-data-service-unit.test.ts` | empty array |
| `exportCourses`: flattens courses across all departments across all campuses | `unit_tests/master-data-service-unit.test.ts` | 2 courses, correct credits |
| `exportSemesters`: serializes `Date` fields as ISO strings | `unit_tests/master-data-service-unit.test.ts` | `startDate`/`endDate` ISO |
| `exportClasses`: flattens classes across all semesters, includes course name | `unit_tests/master-data-service-unit.test.ts` | `courseName` from relation |
| `exportClasses`: returns `[]` when org has no semesters | `unit_tests/master-data-service-unit.test.ts` | empty array |

---

## Coverage Targets

| Metric | Backend | Frontend |
|--------|---------|----------|
| Statements | ≥ 80% | ≥ 75% |
| Branches | ≥ 70% | ≥ 65% |
| Functions | ≥ 80% | ≥ 75% |
| Lines | ≥ 80% | ≥ 75% |

Coverage thresholds are configured in `backend/vitest.config.ts` and `frontend/vitest.config.ts` and enforced by `@vitest/coverage-v8` when `COVERAGE=true ./run_tests.sh` is executed.

## Deferred Coverage

The following areas have documented limitations and are explicitly out of scope for the authored test suite:

| Area | Reason Deferred |
|------|----------------|
| File download happy-path binary streaming | Current tests cover org isolation and not-found semantics; full binary stream assertions with real assets are deferred |
| MySQL dump I/O in backup worker | Requires running Docker; dump execution tested via execSync mock at integration level |
| nginx proxy configuration | Infrastructure layer; not testable with Vitest |
| Full-module DB-backed API matrix | Integration tests exist for observability, alert thresholds, backup/restore, and logistics/memberships smoke paths; exhaustive DB-backed coverage across every module is still deferred |
