# Audit Report 2 Fix Check - Round 3 (Static-Only)

Date: 2026-04-11
Reference: .tmp/audit_report-2.md
Scope: Re-check only the previously reported issues. No runtime execution, no Docker, no test execution.

## Summary
- Issues re-checked: 6
- Fixed: 6
- Partially Fixed: 0
- Not Fixed: 0

---

## Issue Re-check Results

### 1) [High] Backup implementation under-delivers Prompt scope (object-storage metadata + verification depth)
Status: Fixed

Evidence of fix:
- Backup now writes object-storage manifest:
  - repo/backend/src/jobs/workers/backup-worker.ts:67
  - repo/backend/src/jobs/workers/backup-worker.ts:94
- Restore now verifies object-storage manifest and records result:
  - repo/backend/src/jobs/workers/restore-worker.ts:49
  - repo/backend/src/jobs/workers/restore-worker.ts:68
  - repo/backend/src/jobs/workers/restore-worker.ts:73
- Restore now performs schema-compatibility and application-level checks, and fails run if verification checks fail:
  - repo/backend/src/jobs/workers/restore-worker.ts:109
  - repo/backend/src/jobs/workers/restore-worker.ts:121
  - repo/backend/src/jobs/workers/restore-worker.ts:153
- Static test evidence for manifest path/shape in integration test:
  - repo/backend/integration_tests/backup-restore.integration.test.ts:81
  - repo/backend/integration_tests/backup-restore.integration.test.ts:87
  - repo/backend/integration_tests/backup-restore.integration.test.ts:103

---

### 2) [High] Disconnected-LAN/on-prem carrier constraint not enforced in REST connector
Status: Fixed

Evidence of fix:
- Runtime LAN URL enforcement added:
  - repo/backend/src/jobs/workers/carrier-sync-worker.ts:15
  - repo/backend/src/jobs/workers/carrier-sync-worker.ts:33
  - repo/backend/src/jobs/workers/carrier-sync-worker.ts:70
- Create-carrier schema validation enforces LAN-local REST endpoints:
  - repo/backend/src/modules/logistics/schemas.ts:4
  - repo/backend/src/modules/logistics/schemas.ts:45
  - repo/backend/src/modules/logistics/schemas.ts:49

---

### 3) [Medium] API spec contains conflicting backup endpoint namespaces
Status: Fixed

Evidence of fix:
- Current API spec documents only /api/backups endpoints:
  - docs/api-spec.md:1251
  - docs/api-spec.md:1256
  - docs/api-spec.md:1262
  - docs/api-spec.md:1271
- No /api/admin/backups endpoints found in current docs/api-spec.md.

---

### 4) [Medium] README contradicts implementation status of carrier connectors
Status: Fixed

Evidence of fix:
- Stale "Not yet implemented" connector statement is absent from current README (pattern check returned no matches).
- Implementation remains present in worker:
  - repo/backend/src/jobs/workers/carrier-sync-worker.ts:63

---

### 5) [Medium] Frontend permission vocabulary drift risk
Status: Fixed

Evidence of fix:
- Frontend permission constants now use aligned write/read vocabulary (no manage:* constants remain for memberships/wallet):
  - repo/frontend/src/utils/permissions.ts:35
- Drift-prone legacy constants (wallet/audit-log permission constants) are absent from current file.

---

### 6) [Low] Observability API spec documents metrics history endpoint not present in routes
Status: Fixed

Evidence of fix:
- No metrics history endpoint reference found in current docs/api-spec.md.
- Current doc route surface does not include the previously stale /api/observability/metrics/history entry.

---

## Round 3 Verdict
All previously listed issues from .tmp/audit_report-2.md are fixed based on current static evidence.