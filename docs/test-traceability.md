# CampusOps — Requirement-to-Test Traceability

This document maps major functional requirements and business rules to the test files that exercise them. It provides an inspectable audit trail for static acceptance reviews.

## Test Corpus Summary

| Suite | Location | File Count |
|-------|----------|-----------|
| Backend unit tests | `backend/unit_tests/` | 29 |
| Backend API tests (contract + integration) | `backend/api_tests/` | 19 |
| Frontend unit / component tests | `frontend/unit_tests/` | 18 |
| **Total** | | **66** |

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
| Auditor role cannot create users | `api_tests/rbac.api.test.ts` | `POST /api/admin/users` → 403 |
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
| Shipment idempotency header | `api_tests/logistics.api.test.ts` | same X-Idempotency-Key → same response |
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
| Cross-org anomaly action requests return 404 | `api_tests/classroom-ops.api.test.ts` | acknowledge denied with NOT_FOUND |

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
| Missing `read:logistics` permission → 403 | `api_tests/logistics.api.test.ts` | permission enforcement inline |
| rest_api connector fetches and stores updates | `unit_tests/carrier-sync-worker.test.ts` | addTrackingUpdate called 2x |
| rest_api connector HTTP failure → sets errorState + rethrows | `unit_tests/carrier-sync-worker.test.ts` | cursor.errorState set |
| rest_api connector empty response → cursor updated | `unit_tests/carrier-sync-worker.test.ts` | addTrackingUpdate not called |
| file_drop connector processes new .json files | `unit_tests/carrier-sync-worker.test.ts` | addTrackingUpdate + renameSync called |
| file_drop skips non-JSON files | `unit_tests/carrier-sync-worker.test.ts` | readFileSync not called |
| file_drop skips files before last cursor | `unit_tests/carrier-sync-worker.test.ts` | skipped by mtime check |
| manual connector: no-op, updates cursor | `unit_tests/carrier-sync-worker.test.ts` | addTrackingUpdate not called |
| carrier not found → early return | `unit_tests/carrier-sync-worker.test.ts` | upsert not called |

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
| SLA overdue indicator in UI | `frontend/unit_tests/after-sales-view.test.ts` | `.sla-overdue` class |
| SLA near indicator in UI | `frontend/unit_tests/after-sales-view.test.ts` | `.sla-near` class |
| Far deadline → no SLA classes | `frontend/unit_tests/after-sales-view.test.ts` | neither class |

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
| Fulfillment detail is org-scoped | `api_tests/memberships.api.test.ts` | same-org 200, cross-org 404 |
| Auditor read-only wallet | `frontend/unit_tests/memberships-view.test.ts` | no top-up/spend UI |
| OpsManager wallet controls | `frontend/unit_tests/memberships-view.test.ts` | top-up form present |
| Fulfillment form validates line items | `frontend/unit_tests/memberships-view.test.ts` | error on empty items |
| Coupon code passed to service | `frontend/unit_tests/memberships-view.test.ts` | couponCode in payload |
| DB-backed member list is org-scoped | `api_tests/integration/logistics-memberships-api.integration.test.ts` | same-org returns only own member |
| DB-backed member list enforces read permission | `api_tests/integration/logistics-memberships-api.integration.test.ts` | missing `read:memberships` returns 403 |

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
