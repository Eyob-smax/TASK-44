# CampusOps — API Specification

## Deployment Note

In the Docker Compose configuration the frontend nginx container serves the compiled Vue SPA over HTTPS and proxies `/api/*` requests to the backend service on port 4000 over HTTPS on the internal Docker network. Clients target the frontend HTTPS entrypoint on port 443; the backend service is not the primary browser-facing entrypoint in the default container deployment. In development, the Vite dev server proxies `/api/*` to `http://localhost:4000`.

## Conventions

### Base URL
- Development: `http://localhost:4000/api`
- Production (Docker LAN): `https://<host>/api` (via nginx frontend container on port 443)

### Error Envelope
All error responses use a consistent envelope:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "field": ["Error message"]
    }
  },
  "requestId": "uuid"
}
```

**Error codes:**
| Code | HTTP Status | Meaning |
|------|------------|---------|
| `VALIDATION_ERROR` | 400 | Request body or query param validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | Authenticated but lacks required role/permission |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Unique constraint violated or idempotency key replay |
| `UNPROCESSABLE` | 422 | Business rule violation (e.g. wallet balance insufficient) |
| `RATE_LIMITED` | 429 | Too many requests from this client |
| `CIRCUIT_OPEN` | 503 | Carrier connector circuit breaker open |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 100
  }
}
```

### Pagination
All list endpoints accept: `?page=1&limit=25&sort=createdAt&order=desc`

### Idempotency
- `POST` and `PUT` operations on create/update resources accept `X-Idempotency-Key: <key>` header (max 64 chars)
- Exception: `POST /api/orgs/{orgId}/fulfillments` uses a body field `idempotencyKey` (domain-level replay key)
- Key > 64 chars: HTTP 400 `VALIDATION_ERROR`
- **Replay** (row found, response body stored, not expired): returns the original `statusCode` + `responseBody` immediately — handler is NOT called again
- **In-flight** (row found, no response body, not expired): returns HTTP 409 `CONFLICT` ("Request in progress") — another client instance holds this key
- **New** (no row, or expired row): inserts pending record, calls handler, persists response on completion
- Keys expire after **24 hours** from initial request
- Missing key: middleware is a no-op, request proceeds normally

### Authentication
- All endpoints except `POST /api/auth/login` require a valid session token
- Token passed via `Authorization: Bearer <token>` header
- Tokens carry user ID, role set, and org scope
- JWT claims structure: `{ userId: string, username: string, roles: string[], permissions: string[], orgId: string | null }`
- Permissions encoded as `action:resource:scope` strings (e.g., `read:students:*`, `approve:after-sales:*`)
- Token expiry: 8 hours by default (`JWT_EXPIRES_IN`). Stateless — no server-side revocation in this deployment

### File Uploads
- Endpoint: `POST /api/files` (multipart/form-data)
- Accepted types: `image/jpeg`, `image/png` only
- Size limit: 10 MB per file
- Images are normalized before persistence (auto-rotation + standard encoding) for consistent downstream processing
- Duplicate detection: perceptual hash (dHash) comparison before saving
- Response includes `fileAssetId` for reference in subsequent requests

---

## Endpoint Groups

---

### Auth

#### `POST /api/auth/login`
Authenticate with username and password.

**Auth required:** No
**Idempotency:** N/A

**Request:**
```json
{ "username": "string", "password": "string" }
```

**Response:**
```json
{
  "user": { "id": "uuid", "username": "string", "displayName": "string", "orgId": "uuid|null", "roles": [...] },
  "permissions": ["action:resource:scope"],
  "token": "jwt-or-session-token"
}
```

**Errors:** `VALIDATION_ERROR`, `UNAUTHORIZED` (wrong credentials), `RATE_LIMITED`

---

#### `POST /api/auth/logout`
Invalidate the current session.

**Auth required:** Yes
**Response:** `{ "success": true, "data": null }`

---

#### `GET /api/auth/me`
Return current authenticated user profile and permissions.

**Auth required:** Yes
**Response:** Same shape as login response user+permissions (no new token). The `user` object includes `orgId`.

---

### Master Data

#### Students
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/master-data/students` | Required | — | List students (paginated, filterable) |
| `POST` | `/api/master-data/students` | Required | Yes | Create a student |
| `GET` | `/api/master-data/students/:id` | Required | — | Get student by ID |
| `PUT` | `/api/master-data/students/:id` | Required | Yes | Update student |
| `DELETE` | `/api/master-data/students/:id` | Admin only | — | Soft-delete student |

**POST request:**
```json
{
  "studentNumber": "STU-001",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.edu"
}
```
**Errors:** `CONFLICT` (duplicate studentNumber in org), `VALIDATION_ERROR`

#### Departments
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/master-data/departments` | Required | List departments |
| `POST` | `/api/master-data/departments` | Required | Create department |
| `PUT` | `/api/master-data/departments/:id` | Required | Update department |

**Errors:** `CONFLICT` (duplicate code in campus)

#### Courses
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/master-data/courses` | Required | List courses |
| `POST` | `/api/master-data/courses` | Required | Create course |
| `PUT` | `/api/master-data/courses/:id` | Required | Update course |

**Errors:** `CONFLICT` (duplicate code in department)

#### Semesters & Classes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/master-data/semesters` | Required | List semesters |
| `POST` | `/api/master-data/semesters` | Required | Create semester |
| `GET` | `/api/master-data/classes` | Required | List classes |
| `POST` | `/api/master-data/classes` | Required | Create class |

#### Import / Export
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/master-data/import` | Required | Upload Excel/CSV file for bulk import |
| `GET` | `/api/master-data/import/:jobId` | Required | Get import job status and row error counts |
| `GET` | `/api/master-data/import/:jobId/errors` | Required | Download error report file |
| `POST` | `/api/master-data/export` | Required | Queue export job |
| `GET` | `/api/master-data/export/:jobId` | Required | Get export job status and download link |

**Import request:** `multipart/form-data` with `file` (xlsx/csv) and `entityType` (students/classes/departments/courses/semesters)

**Import response:**
```json
{
  "jobId": "uuid",
  "status": "pending",
  "message": "Import queued"
}
```

---

### Classroom Operations

#### `GET /api/classroom-ops/dashboard`
Real-time dashboard state: all classrooms with current status, latest confidence, and open anomaly count.

**Auth required:** Yes
**Query params:** `?campusId=uuid` (required)

**Response:**
```json
{
  "classrooms": [
    {
      "id": "uuid",
      "name": "Room 101",
      "building": "Main",
      "status": "online",
      "lastHeartbeatAt": "ISO8601",
      "latestConfidence": 0.92,
      "openAnomalyCount": 0
    }
  ]
}
```

**Errors:** `VALIDATION_ERROR` (missing campusId), `NOT_FOUND` (campus missing or out of org scope)

---

#### Heartbeats & Telemetry
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/classroom-ops/heartbeat` | Required | Ingest classroom heartbeat |
| `POST` | `/api/classroom-ops/confidence` | Required | Ingest recognition confidence sample |

---

#### Anomaly Lifecycle
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/classroom-ops/anomalies` | Required | — | List anomalies (filterable by status, classroomId) |
| `POST` | `/api/classroom-ops/anomalies` | Required | Yes | Report a new anomaly event |
| `GET` | `/api/classroom-ops/anomalies/:id` | Required | — | Get anomaly with full lifecycle state |
| `POST` | `/api/classroom-ops/anomalies/:id/acknowledge` | Required | Yes | Acknowledge anomaly |
| `POST` | `/api/classroom-ops/anomalies/:id/assign` | Required | Yes | Assign anomaly to a user |
| `POST` | `/api/classroom-ops/anomalies/:id/resolve` | Required | Yes | Resolve anomaly (resolutionNote required) |

**Resolve request:**
```json
{ "resolutionNote": "Investigated and resolved connectivity issue by restarting switch port." }
```
**Errors:** `VALIDATION_ERROR` (missing/empty resolutionNote), `CONFLICT` (already resolved), `NOT_FOUND`

---

### Parking Operations

#### `GET /api/parking/facilities`
List parking facilities available to the caller's org context.

**Auth required:** Yes

**Response (array):**
```json
[
  {
    "id": "uuid",
    "name": "North Lot",
    "totalSpaces": 100,
    "campusId": "uuid"
  }
]
```

#### `GET /api/parking/facilities/:id/status`
Current parking facility status: available spaces, turnover, open and escalated exception counts.

**Auth required:** Yes
**Path params:** `:id` — facility UUID

**Response per facility:**
```json
{
  "facilityId": "uuid",
  "facilityName": "North Lot",
  "totalSpaces": 100,
  "availableSpaces": 42,
  "turnoverPerHour": 8.3,
  "openExceptions": 2,
  "escalatedExceptions": 1
}
```

---

#### Parking Events & Sessions
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/parking/events` | Required | Ingest a plate reader event |
| `GET` | `/api/parking/sessions` | Required | List parking sessions (filterable) |
| `GET` | `/api/parking/sessions/:id` | Required | Get session detail |

---

#### Parking Exceptions
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/parking/exceptions` | Required | — | List exceptions (filter by status, facilityId, type) |
| `GET` | `/api/parking/exceptions/:id` | Required | — | Get exception detail |
| `POST` | `/api/parking/exceptions/:id/resolve` | Required | Yes | Resolve exception (resolutionNote required) |

**Resolve request:**
```json
{ "resolutionNote": "Operator verified plate manually — no violation." }
```
**Errors:** `VALIDATION_ERROR` (empty resolutionNote), `CONFLICT` (already resolved)

---

#### Parking Escalations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/parking/exceptions/:id/escalate` | OpsManager/Admin | Escalate an open exception |

---

### Logistics

#### Warehouses
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/logistics/warehouses` | Required | — | List warehouses |
| `POST` | `/api/logistics/warehouses` | Required | Yes | Create warehouse |
| `PUT` | `/api/logistics/warehouses/:id` | Required | Yes | Update warehouse |

#### Carriers
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/logistics/carriers` | Required | — | List carriers |
| `POST` | `/api/logistics/carriers` | Required | Yes | Create carrier |
| `PUT` | `/api/logistics/carriers/:id` | Required | Yes | Update carrier |
| `GET` | `/api/logistics/carriers/:id/sync-status` | Required | — | Get carrier sync cursor and last error |

#### Delivery Zones & Non-Serviceable ZIPs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/logistics/zones` | Required | List delivery zones |
| `POST` | `/api/logistics/zones` | Required | Create delivery zone |
| `PUT` | `/api/logistics/zones/:id` | Required | Update delivery zone |
| `GET` | `/api/logistics/non-serviceable-zips` | Required | List non-serviceable ZIPs |
| `POST` | `/api/logistics/non-serviceable-zips` | Required | Add non-serviceable ZIP |
| `DELETE` | `/api/logistics/non-serviceable-zips/:id` | Required | Remove non-serviceable ZIP |

#### Shipping Fee Templates
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/logistics/fee-templates` | Required | — | List fee templates |
| `POST` | `/api/logistics/fee-templates` | Required | Yes | Create fee template with surcharges |
| `PUT` | `/api/logistics/fee-templates/:id` | Required | Yes | Update fee template |
| `POST` | `/api/logistics/fee-templates/calculate` | Required | — | Calculate shipping fee for given params |

**Calculate request:**
```json
{
  "weightLb": 3.5,
  "itemCount": 2,
  "regionCode": "CONT_US",
  "tier": "standard",
  "applicableSurcharges": ["alaska_hawaii"]
}
```

#### Shipments & Parcels
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/orgs/{orgId}/shipments` | Required | — | List shipments for org (filterable by status) |
| `POST` | `/api/shipments` | Required | Yes | Create shipment with parcels |
| `GET` | `/api/shipments/:id` | Required | — | Get shipment with parcels and tracking |
| `POST` | `/api/shipments/:id/tracking` | Required | — | Append tracking update to shipment |

---

### After-Sales

#### Tickets
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/after-sales/tickets` | Required | — | List tickets (filterable by type, status, priority) |
| `POST` | `/api/after-sales/tickets` | Required | Yes | Create ticket |
| `GET` | `/api/after-sales/tickets/:id` | Required | — | Get full ticket with timeline, evidence, compensations |
| `PUT` | `/api/after-sales/tickets/:id` | Required | Yes | Update ticket (assign, change status) |

#### Evidence Upload
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/after-sales/tickets/:id/evidence` | Required | Upload evidence file (multipart, JPEG/PNG, 10MB) |
| `GET` | `/api/after-sales/tickets/:id/evidence` | Required | List evidence for ticket |

#### Timeline Notes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/after-sales/tickets/:id/timeline` | Required | Add a note to the ticket timeline |

#### Compensation
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/after-sales/tickets/:id/compensations` | Required | — | List compensation suggestions for ticket |
| `POST` | `/api/after-sales/tickets/:id/compensations/:sid/approve` | Required | Yes | Approve or reject a compensation suggestion |

**Approve request:**
```json
{ "decision": "approved", "notes": "Verified delay exceeds 48 hours." }
```
**Errors:** `CONFLICT` (already decided), `UNPROCESSABLE` (would exceed cap), `FORBIDDEN` (insufficient role)

#### Compensation Policies (Admin)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/after-sales/policies` | Admin/OpsManager | List compensation policies |
| `POST` | `/api/after-sales/policies` | Admin | Create policy |
| `PUT` | `/api/after-sales/policies/:id` | Admin | Update policy |

---

### Files

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/files` | Required (`write:after-sales:*`) | Upload image asset (JPEG/PNG, max 10MB, normalized + duplicate-checked) |
| `GET` | `/api/files/:id` | Required | Download file asset by id (org-scoped access control) |

**GET /api/files/:id errors:** `NOT_FOUND` when asset does not exist, caller is out of org scope, or stored file path is missing on disk.

---

### Memberships

#### Tiers
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/orgs/{orgId}/membership-tiers` | Required | — | List membership tiers for org |
| `POST` | `/api/orgs/{orgId}/membership-tiers` | Admin | Yes | Create tier |

#### Members
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/orgs/{orgId}/members` | Required | — | List members for org (paginated, search, tierId filter) |
| `POST` | `/api/orgs/{orgId}/members` | Required | Yes | Enroll a member |
| `GET` | `/api/members/:id` | Required | — | Get member detail |

#### Coupons
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `POST` | `/api/orgs/{orgId}/coupons` | Admin/OpsManager | Yes | Create coupon |

#### Wallet
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/members/:id/wallet` | Required | — | Get wallet balance and status |
| `POST` | `/api/members/:id/wallet/topup` | Required | Yes | Top up wallet balance |
| `POST` | `/api/members/:id/wallet/spend` | Required | Yes | Spend from wallet |

**Idempotency transport:** wallet write operations use `X-Idempotency-Key` header.

**Top-up request:**
```json
{ "amount": 25.00 }
```
**Errors:** `UNPROCESSABLE` (wallet not enabled), `VALIDATION_ERROR` (amount ≤ 0)

**Spend request:**
```json
{ "amount": 10.00, "referenceType": "fulfillment_request", "referenceId": "uuid" }
```
**Errors:** `UNPROCESSABLE` (insufficient balance, wallet not enabled)

#### Fulfillment Requests
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `POST` | `/api/orgs/{orgId}/fulfillments` | Required | Yes (body field) | Submit fulfillment request |
| `GET` | `/api/members/fulfillments/:id` | Required | — | Get fulfillment request detail (org-scoped) |

**Fulfillment request body includes idempotencyKey field for replay safety.**

---

### Observability

#### Metrics
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/observability/metrics` | Required | Latest metric values summary |

#### Logs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/observability/logs` | Required | Search application logs (level, text, date range, paginated) |

#### Alerts
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/observability/alert-thresholds` | Required | — | List alert thresholds |
| `POST` | `/api/observability/alert-thresholds` | Admin | Yes | Create threshold |
| `PUT` | `/api/observability/alert-thresholds/:id` | Admin | Yes | Update threshold (toggle active) |
| `GET` | `/api/observability/alert-events` | Required | — | List triggered alert events |
| `POST` | `/api/observability/alert-events/:id/acknowledge` | Required | — | Acknowledge alert |

#### Notifications
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/observability/notifications` | Required | List unread notifications for current user's role |
| `POST` | `/api/observability/notifications/:id/read` | Required | Mark notification as read |

---

### Admin

#### Configuration
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/admin/config` | Admin | — | Get current application configuration |
| `PUT` | `/api/admin/config` | Admin | Yes | Update application configuration |

#### Users & Roles
| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| `GET` | `/api/admin/users` | Admin | — | List users |
| `POST` | `/api/admin/users` | Admin | Yes | Create user |
| `PUT` | `/api/admin/users/:id` | Admin | Yes | Update user (roles, active status) |
| `GET` | `/api/admin/roles` | Admin | — | List roles |

#### Background Jobs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/jobs` | Admin | List background jobs (filter by type, status) |
| `GET` | `/api/admin/jobs/:id` | Admin | Get job detail |

#### Integrations (Carrier Connectors)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/integrations` | Admin/OpsManager | List carrier connector states |
| `POST` | `/api/admin/integrations/:carrierId/trigger-sync` | Admin/OpsManager | Manually trigger carrier sync |
| `GET` | `/api/admin/integrations/:carrierId/health` | Admin | Get connector health and circuit breaker state |

---

## Integration Contract

Carrier connectors are internal LAN adapters, not public-facing APIs. They communicate via:
- **REST API**: Signed HMAC requests to on-prem carrier endpoints on LAN
- **File drop**: Poll a mounted network path for carrier-provided CSV/JSON files
- **Manual**: Operator enters tracking updates directly via UI

Connector requests are signed using:
```
X-CampusOps-Signature: HMAC-SHA256 timestamp=<unix_ms>,signature=<hex>
```

**Signing algorithm:** HMAC-SHA256 over `${timestampMs}:${payload}`. Result is lowercase hex.

**Replay window:** Signatures older than **5 minutes** (`maxAgeMs = 300000`) are rejected. Future timestamps beyond 5 minutes are also rejected.

**Timing-safe comparison:** `crypto.timingSafeEqual` is used to prevent timing-based signature forgery.

**Secret provisioning:** `generateSigningSecret()` returns a 64-char hex string (32 random bytes). Stored encrypted in carrier `connectorConfig`.

No connector makes outbound internet calls. All sync data originates from LAN-local carrier systems.

---

## Business Module Endpoints

Routes use org-scoped prefixes (`/api/orgs/:orgId/...`) or resource-scoped prefixes as appropriate.

---

### Master Data (Org-Scoped)

#### `POST /api/orgs/:orgId/import`
Enqueue a bulk import job for a supported entity type.

**Auth required:** Yes (`Administrator`, `OpsManager` roles)
**Request:**
```json
{ "entityType": "students", "fileName": "students-batch-01.csv" }
```
**Response (202):**
```json
{ "success": true, "data": { "importJobId": "uuid", "jobId": "uuid" } }
```
**Errors:** `VALIDATION_ERROR` (invalid entityType)

---

#### `GET /api/orgs/:orgId/import/:id`
Get import job status, row counts, and error report asset link.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "entityType": "students",
    "status": "partial_success",
    "successRows": 48,
    "failedRows": 2,
    "errorReportAssetId": "uuid",
    "completedAt": "ISO8601"
  }
}
```

---

#### `POST /api/orgs/:orgId/export`
Enqueue an export job.

**Auth required:** Yes (`Administrator`, `OpsManager`, `Auditor` roles)
**Request:**
```json
{ "entityType": "students", "format": "csv" }
```
**Response (202):**
```json
{ "success": true, "data": { "exportJobId": "uuid", "jobId": "uuid" } }
```

---

### Classroom Ops

#### `POST /api/classroom-ops/anomalies/:id/acknowledge`
Acknowledge an open anomaly.

**Auth required:** Yes (`write:classroom-ops:*` permission)
**Response (200):**
```json
{
  "success": true,
  "data": { "id": "uuid", "anomalyEventId": "uuid", "userId": "uuid", "acknowledgedAt": "ISO8601" }
}
```
**Errors:** `CONFLICT` (already acknowledged), `UNPROCESSABLE` (invalid status transition)

---

#### `POST /api/classroom-ops/anomalies/:id/assign`
Assign an anomaly to a user.

**Request:**
```json
{ "assignedToUserId": "uuid" }
```
**Response (200):**
```json
{
  "success": true,
  "data": { "id": "uuid", "anomalyEventId": "uuid", "assignedToUserId": "uuid", "assignedByUserId": "uuid", "assignedAt": "ISO8601" }
}
```
**Errors:** `UNPROCESSABLE` (cannot assign resolved anomaly)

---

#### `POST /api/classroom-ops/anomalies/:id/resolve`
Resolve an anomaly. `resolutionNote` is required.

**Request:**
```json
{ "resolutionNote": "Replaced the camera USB cable — feed restored." }
```
**Response (200):**
```json
{
  "success": true,
  "data": { "id": "uuid", "anomalyEventId": "uuid", "userId": "uuid", "resolutionNote": "...", "resolvedAt": "ISO8601" }
}
```
**Errors:** `VALIDATION_ERROR` (missing or empty resolutionNote), `UNPROCESSABLE` (already resolved)

---

### Parking

#### `POST /api/parking/events`
Ingest a parking reader event (entry or exit).

**Auth required:** Yes (`write:parking:*` permission)
**Request:**
```json
{
  "readerId": "uuid",
  "plateNumber": "ABC-123",
  "eventType": "entry",
  "capturedAt": "ISO8601"
}
```
**Response (200):**
```json
{
  "success": true,
  "data": {
    "event": { "id": "uuid", "eventType": "entry", "plateNumber": "ABC-123" },
    "session": { "id": "uuid", "status": "active", "entryAt": "ISO8601" },
    "exception": null
  }
}
```
When no plate: `session` is null, `exception` has `type: "no_plate"`.
When duplicate plate: `session` is null, `exception` has `type: "duplicate_plate"`.

---

#### `POST /api/parking/exceptions/:id/resolve`
Resolve a parking exception. `resolutionNote` is required.

**Request:**
```json
{ "resolutionNote": "Owner confirmed vehicle moved to authorized bay." }
```
**Response (200):**
```json
{
  "success": true,
  "data": { "id": "uuid", "status": "resolved", "resolutionNote": "...", "resolvedAt": "ISO8601" }
}
```
**Errors:** `VALIDATION_ERROR` (empty resolutionNote)

---

### Logistics

#### `GET /api/orgs/{orgId}/shipments`
List shipments for an org (paginated, filterable by status).

**Auth required:** Yes (`read:logistics:*` permission)
**Query params:** `?status=pending|in_transit|delivered&page=1&limit=20`

**Response (200):**
```json
{
  "success": true,
  "data": [{ "id": "uuid", "status": "pending", "parcels": [] }],
  "meta": { "total": 5, "page": 1, "limit": 20 }
}
```

---

#### `POST /api/shipments`
Create a shipment with parcels. Idempotent via `X-Idempotency-Key` header.

**Auth required:** Yes (`write:logistics:*` permission)
**Request:**
```json
{
  "orgId": "uuid",
  "warehouseId": "uuid",
  "carrierId": "uuid",
  "recipientName": "Jane Doe",
  "recipientAddress": "123 Main St",
  "recipientCity": "Springfield",
  "recipientZip": "12345",
  "parcels": [
    { "weightLb": 2.5, "lengthCm": 30, "widthCm": 20, "heightCm": 15, "description": "Books" }
  ]
}
```
**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "pending",
    "parcels": [{ "id": "uuid", "weightLb": 2.5 }],
    "trackingUpdates": []
  }
}
```

---

#### `POST /api/shipments/:id/tracking`
Append a tracking update to a shipment.

**Request:**
```json
{ "status": "in_transit", "location": "Chicago Hub", "source": "carrier_api" }
```
**Response (200):** `{ "success": true, "data": null }`

When `status = "delivered"`, `shipment.deliveredAt` is set automatically.

---

### After-Sales

#### `POST /api/orgs/:orgId/tickets`
Create an after-sales ticket. SLA deadline set from priority.

**Auth required:** Yes (`write:after-sales:*` permission)
**Request:**
```json
{
  "type": "dispute",
  "subject": "Wrong item delivered",
  "description": "Received red shirt instead of blue",
  "priority": "high"
}
```
**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "open",
    "slaDeadlineAt": "ISO8601",
    "timeline": [{ "id": "uuid", "entryType": "created", "content": "Ticket opened" }]
  }
}
```

---

#### `POST /api/tickets/:id/suggest-compensation`
Trigger automated compensation suggestion based on active policies.

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "suggestedAmount": 25.00,
    "status": "pending",
    "reason": "Policy: delivery_late_48h"
  }
}
```
Returns `data: null` when the per-ticket cap has been reached.

---

#### `POST /api/tickets/:id/compensations/:suggestionId/approve`
Approve or reject a compensation suggestion.

**Auth required:** `OpsManager` or `Administrator` role
**Request:**
```json
{ "decision": "approved", "notes": "Validated against shipment records" }
```
**Response (200):**
```json
{
  "success": true,
  "data": { "id": "uuid", "decision": "approved", "approvedByUserId": "uuid" }
}
```
**Errors:** `UNPROCESSABLE` (suggestion already processed), `FORBIDDEN` (insufficient role)

---

### Memberships

#### `POST /api/members/:id/wallet/topup`
Top up a member's stored value wallet. Idempotent via `X-Idempotency-Key`.

**Auth required:** Yes (`write:memberships:*` permission)
**Request:**
```json
{ "amount": 50.00 }
```
**Response (200):**
```json
{
  "success": true,
  "data": {
    "walletId": "uuid",
    "ledgerEntry": { "entryType": "TOPUP", "amount": 50.00, "balanceBefore": 0, "balanceAfter": 50.00 },
    "receipt": { "receiptNumber": "RCP-2026-AB12CD34" }
  }
}
```

---

#### `POST /api/members/:id/wallet/spend`
Spend from a member's wallet. Idempotent via `X-Idempotency-Key`.

**Request:**
```json
{ "amount": 20.00, "referenceType": "fulfillment", "referenceId": "uuid" }
```
**Response (200):**
```json
{
  "success": true,
  "data": {
    "ledgerEntry": { "entryType": "SPEND", "amount": 20.00, "balanceBefore": 50.00, "balanceAfter": 30.00 }
  }
}
```
**Errors:** `UNPROCESSABLE` (insufficient balance)

---

#### `POST /api/orgs/:orgId/fulfillments`
Create a fulfillment request with optional member pricing, coupon, and wallet payment.

**Auth required:** Yes (`write:memberships:*` permission)
**Request:**
```json
{
  "idempotencyKey": "order-ref-12345",
  "memberId": "uuid",
  "couponCode": "SAVE10",
  "lineItems": [
    { "productId": "uuid", "productName": "Widget A", "unitPrice": 25.00, "quantity": 2, "itemCategory": "electronics" }
  ],
  "recipientZip": "12345",
  "useWallet": false
}
```
**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "totalAmount": 50.00,
    "discountAmount": 5.00,
    "shippingFee": 8.50,
    "finalAmount": 53.50,
    "status": "confirmed"
  }
}
```
**Errors:** `UNPROCESSABLE` (expired coupon, max redemptions reached), `CONFLICT` (duplicate idempotencyKey with different body)

---

## Frontend HTTP Contracts

### Auth — POST /api/auth/login

**Request:**
```json
{ "username": "admin", "password": "secret" }
```
**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "username": "admin", "displayName": "Admin", "roles": [{ "id": "r1", "name": "Administrator" }] },
    "permissions": ["read:classroom-ops:*", "write:classroom-ops:*"],
    "token": "eyJ..."
  }
}
```
**Errors:** `UNAUTHORIZED` (wrong credentials), `UNPROCESSABLE` (account locked)

---

### Auth — GET /api/auth/me

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "username": "admin", "displayName": "Admin", "roles": [{ "id": "r1", "name": "Administrator" }] },
    "permissions": ["read:classroom-ops:*"]
  }
}
```
**Errors:** `UNAUTHORIZED` (token expired or invalid)

---

### Auth — POST /api/auth/logout

**Headers:** `Authorization: Bearer <token>`

**Response (200):** `{ "success": true, "data": {} }`

---

### Frontend HTTP Contract Notes

- All API calls use `baseURL: /api`, proxied by Vite dev server to `http://localhost:4000`
- Authorization header: `Bearer <token>` injected by Axios request interceptor
- All success responses: `{ "success": true, "data": <T> }`
- All error responses: `{ "success": false, "error": { "code": "...", "message": "...", "details": {} } }`
- Frontend normalizes HTTP error responses to `ApiError(code, message, details)` via Axios response interceptor
- Polling intervals by module: Dashboard 30s, Classroom Ops 20s, Parking 15s

---

## Primary Screen Service Contracts

### FulfillmentView Service Calls

**`GET /api/orgs/{orgId}/shipments`** (via `logisticsService.listShipments`)
```
Query: status?, page, limit
Response: { shipments: ShipmentResponse[], total: number }
```

**`GET /api/orgs/{orgId}/warehouses`** (via `logisticsService.listWarehouses`)
```
Response: WarehouseResponse[]
```

**`GET /api/orgs/{orgId}/carriers`** (via `logisticsService.listCarriers`)
```
Response: CarrierResponse[]  (connectorConfig excluded from list)
```

**`POST /api/shipments`** (via `logisticsService.createShipment`)
```json
{
  "orgId": "org-1",
  "warehouseId": "wh-abc",
  "carrierId": "ca-xyz",
  "trackingNumber": "TRK-001",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "parcels": [
    { "description": "Box A", "weightLb": 2.5, "quantity": 1 }
  ]
}
```
Response `201`: `{ id, status: "pending", trackingNumber, parcels: [...], tracking: [] }`

**`POST /api/shipments/{id}/tracking`** (via `logisticsService.addTrackingUpdate`)
```json
{ "status": "shipped", "location": "Warehouse A", "source": "manual" }
```

---

### AfterSalesView Service Calls

**`GET /api/orgs/{orgId}/tickets`** (via `afterSalesService.listTickets`)
```
Query: status?, priority?, page, limit
Response: { tickets: TicketResponse[], total: number }
```

**`POST /api/orgs/{orgId}/tickets`** (via `afterSalesService.createTicket`)
```json
{ "type": "delay", "priority": "high", "shipmentId": "ship-1", "description": "Package not delivered" }
```
Response `201`: `TicketResponse` with `timeline: [{ entryType: "created" }]`, `evidence: []`, `compensations: []`

**`POST /api/tickets/{id}/suggest-compensation`** (via `afterSalesService.suggestCompensation`)
```
Response: { suggestion: CompensationResponse | null }
```
`null` means the per-ticket compensation cap was already reached.

**`POST /api/tickets/{id}/compensations/{suggestionId}/approve`** (via `afterSalesService.approveCompensation`)
```json
{ "decision": "approved", "notes": "Within policy cap" }
```

**SLA coloring rules (client-computed, no API call):**
- `isSlaOverdue(deadline)` → `deadline < Date.now()` → `.sla-overdue` class (red)
- `isSlaClose(deadline)` → `0 < deadline - Date.now() < 4h` → `.sla-near` class (amber)

---

### MembershipsView Service Calls

**`GET /api/orgs/{orgId}/members`** (via `membershipsService.listMembers`)
```
Query: search?, tierId?, page, limit
Response: { members: MemberResponse[], total: number }
```

**`POST /api/members/{id}/wallet/topup`** (via `membershipsService.topUpWallet`)
```json
{ "amount": 50.00, "idempotencyKey": "uuid-v4" }
```
Response: `{ walletId, memberId, ledgerEntry: { amount, balanceBefore, balanceAfter }, receipt: { receiptNumber } }`

**`POST /api/orgs/{orgId}/fulfillments`** (via `membershipsService.createFulfillment`)
```json
{
  "memberId": "mem-1",
  "idempotencyKey": "uuid-v4",
  "couponCode": "SAVE10",
  "useWallet": true,
  "lineItems": [
    { "description": "Widget A", "unitPrice": 25.00, "quantity": 2, "itemCategory": "electronics" }
  ]
}
```
Response: `{ id, totalAmount, shippingFee, discountAmount, finalAmount, lineItems }`

---

### AdminView Service Calls

**`GET /api/orgs/{orgId}/students`** (via `masterDataService.listStudents`)
```
Query: search?, page, limit
Response: { students: StudentResponse[], total: number }
```

**`POST /api/orgs/{orgId}/import`** (via `masterDataService.triggerImport`)
```json
{ "entityType": "students" }
```
Response `202`: `{ importJobId: "job-abc" }`

**`GET /api/orgs/{orgId}/import/jobs/{jobId}`** (via `masterDataService.getImportJob`)
```
Response: {
  id, status: "pending"|"processing"|"partial_success"|"success"|"failed",
  successRows: number | null,
  failedRows: number | null,
  errorReportAssetId: string | null
}
```
When `failedRows > 0` and `errorReportAssetId` is set, frontend shows:
`<a href="/api/files/{errorReportAssetId}">Download Error Report CSV</a>`

**`POST /api/orgs/{orgId}/export`** (via `masterDataService.triggerExport`)
```json
{ "entityType": "students" }
```
Response `202`: `{ exportJobId: "job-xyz" }`

**`GET /api/orgs/{orgId}/export/jobs/{jobId}`** (via `masterDataService.getExportJob`)
```
Response: { id, status: "pending"|"processing"|"completed"|"failed", fileAssetId: string | null }
```
When `status === "completed"` and `fileAssetId` set, frontend shows:
`<a href="/api/files/{fileAssetId}" download="export_students_2026-04-10.csv">Download export_students_2026-04-10.csv</a>`

---

## Observability Endpoints

**Auth**: `POST /api/observability/metrics` uses HMAC signing (`X-Signature`, `X-Timestamp`). All other observability endpoints use JWT Bearer auth.

### POST /api/observability/metrics
Ingests a runtime metric sample. Called by internal classroom agents.
```json
{ "metricName": "cpu_utilization", "value": 75.4, "unit": "percent" }
```
Response `202`: `{ success: true, data: {} }`

On ingestion, all active thresholds for the metric name are evaluated. Any violations fire an `AlertEvent` and a `BANNER` `NotificationEvent`.

### GET /api/observability/metrics
Returns the most-recent value per metric name.
```json
{
  "p95Latency": 182,
  "cpuUtilization": 75.4,
  "gpuUtilization": 42.1,
  "errorRate": 0.8,
  "collectedAt": "2026-04-10T08:00:00.000Z"
}
```

### GET /api/observability/logs
Query params: `level` (debug|info|warn|error), `search` (substring), `startDate`, `endDate`, `page`, `limit`.
```json
{ "logs": [...], "total": 142 }
```

### POST /api/observability/thresholds
Creates an alert threshold. Requires `OpsManager` or `Administrator`.
```json
{ "metricName": "cpu_utilization", "operator": "gt", "thresholdValue": 90 }
```
Response `201`: threshold object.

Valid operators: `gt`, `gte`, `lt`, `lte`, `eq`.

### PATCH /api/observability/thresholds/:id
Updates operator, thresholdValue, or isActive (toggle on/off).

### DELETE /api/observability/thresholds/:id
Requires `Administrator`. Response `204`.

### GET /api/observability/alerts
Query param: `onlyUnacknowledged` (boolean). Returns alert event list with threshold details joined.

### POST /api/observability/alerts/:id/acknowledge
Marks an alert as acknowledged by the authenticated user. Response `200`.

### GET /api/observability/notifications
Query param: `unreadOnly`. Returns notification list (banner type).

### POST /api/observability/notifications/:id/read
Marks a notification as read. Response `200`.

---

## Configuration Endpoint

**Auth**: JWT Bearer. GET requires `Administrator`, `OpsManager`, or `Auditor`. PATCH requires `Administrator`.

### GET /api/config
```json
{
  "config": {
    "heartbeatFreshnessSeconds": 120,
    "storedValueEnabled": false,
    "maxUploadSizeBytes": 10485760,
    "acceptedImageMimeTypes": ["image/jpeg", "image/png"],
    "logRetentionDays": 30,
    "parkingEscalationMinutes": 15,
    "backupRetentionDays": 14,
    "storagePath": "/data/object-storage",
    "backupPath": "/data/backups"
  },
  "updatedAt": "2026-04-10T08:00:00.000Z"
}
```

### PATCH /api/config
Adjustable fields only:
```json
{
  "heartbeatFreshnessSeconds": 60,
  "storedValueEnabled": true,
  "logRetentionDays": 7,
  "parkingEscalationMinutes": 30
}
```
Returns same shape as GET. Changes persist in memory until process restart.

---

## Backup & Restore Endpoints

**Auth**: JWT Bearer. GET endpoints require `Administrator`, `OpsManager`, or `Auditor`. POST endpoints require `Administrator`.

### GET /api/backups
```json
{ "backups": [{ "id": "...", "type": "full", "status": "completed", "sizeBytes": "8192", "startedAt": "...", "completedAt": "...", "expiresAt": "..." }] }
```

### POST /api/backups
```json
{ "type": "full" }
```
Response `202`: `{ backupId: "..." }`. Enqueues a `backup` background job.

### GET /api/backups/:id
Returns backup record with nested `restoreRuns` array (last 5, ordered by `startedAt desc`).

### POST /api/backups/:id/restore
Validates backup `status === 'completed'`, creates `RestoreRun`, enqueues `restore` job.
Response `202`: `{ restoreRunId: "..." }`

Returns `404` if backup does not exist, `400` if backup status is not `completed`.

### GET /api/backups/restore-runs/all
Returns all restore runs (last 20) with backup type/startedAt and `performedBy` username joined.
