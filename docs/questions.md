# questions.md

## 1. Telemetry source and freshness rules for classroom online status, recognition confidence, and anomaly events

**The Gap**  
The prompt requires a real-time dashboard with classroom online status, a recognition confidence indicator, and an anomaly event stream, but it does not define the upstream event source, freshness window, or how “online” becomes stale on a disconnected local network.

**The Interpretation**  
Treat these signals as coming from LAN-local producers such as classroom agents, on-prem sensors, or existing district systems that push or post telemetry into CampusOps over the local network. “Online” should be derived from the latest heartbeat within a configurable freshness threshold rather than inferred indefinitely from the last known value.

**Proposed Implementation**  
Implement a telemetry ingestion module with authenticated local endpoints and/or adapter jobs that persist heartbeats, confidence samples, and anomaly events. Add configurable freshness thresholds and anomaly-type dictionaries in admin settings, and compute classroom status from the latest valid heartbeat. Expose dashboard read models optimized for time-window filters and live operator queues.

## 2. Parking event-to-session assembly and exception closure semantics

**The Gap**  
The prompt lists parking exception types and a 15-minute escalation rule, but it does not define how raw entry/exit reads become parking sessions, how duplicate/inconsistent events are resolved, or what formally closes an exception.

**The Interpretation**  
Use a deterministic parking-session assembler based on local reader events. Exceptions remain open until an operator records a valid resolution outcome with a resolution note, and unresolved alerts escalate automatically after 15 minutes.

**Proposed Implementation**  
Model `parking_events`, `parking_sessions`, `parking_exceptions`, and `parking_escalations`. Build a rules engine that evaluates incoming entry/exit events against recent plate/session history, emits exception records, and schedules escalation checks in the DB-backed job monitor. Require a typed closure reason plus free-text resolution note to close an exception.

## 3. Pricing precedence across member pricing, coupons, shipping templates, surcharges, and stored value

**The Gap**  
The prompt includes member-only pricing, coupons, shipping fee templates, Alaska/Hawaii surcharges, and optional stored value, but it does not specify the exact order of operations for price calculation or which discounts can stack.

**The Interpretation**  
Use a deterministic quote pipeline: base line items → member pricing adjustments → coupon eligibility/discounts → shipping calculation → regional surcharges → wallet payment application. Stored value acts as a payment source, not as an additional discount layer.

**Proposed Implementation**  
Implement a pricing engine with versioned rule evaluation steps and an auditable quote breakdown object. Persist quote snapshots on fulfillment requests and ticket-related compensation decisions so later disputes can reconstruct the calculation. Expose admin policy settings for coupon stacking constraints and surcharge rules.

## 4. Optional stored value enablement, wallet accounting scope, and receipt behavior

**The Gap**  
The prompt says stored value is optional and, if enabled, supports top-up and spending with clear balance feedback and printable receipts, but it does not define whether it is enabled globally or per member segment, how reversals work, or how receipts should be represented.

**The Interpretation**  
Treat stored value as an organization-level feature flag with optional future extension to membership-tier eligibility. Wallet activity must be fully ledgered, reversible through compensating entries only, and printable receipts should be generated from persisted transaction snapshots.

**Proposed Implementation**  
Create a wallet subsystem with feature-flagged availability, append-only wallet ledger entries, top-up/spend/refund transaction types, and receipt records rendered through backend-generated printable documents. Encrypt current balances and sensitive ledger payloads at rest, while preserving non-sensitive receipt summaries for operator access.

## 5. Role boundaries, approval powers, and data-scope rules

**The Gap**  
The prompt names five roles, but it does not fully define object-level scope boundaries, which actions require dual control or approval, or which sensitive fields the Auditor can view versus masked-read access.

**The Interpretation**  
Use a centrally defined permission matrix plus scope bindings by campus/location/warehouse/classroom domain. The Auditor is strictly read-only, and any manual approval of compensation or sensitive policy changes requires explicit role-gated actions rather than broad administrative access.

**Proposed Implementation**  
Implement role, permission, and scope tables with explicit action keys consumed by frontend route/menu guards and backend middleware. Add field-masking policies by role and resource type. Gate high-risk actions such as compensation approval, service-policy changes, and backup/restore administration behind narrower permissions than general system setup.

## 6. TLS certificate provisioning on a disconnected LAN

**The Gap**  
The prompt requires TLS even on LAN, but it does not specify whether certificates are provided by a district CA, self-signed, or generated during deployment.

**The Interpretation**  
Assume production deployments supply certificate material through local admin-controlled files or a district-trusted internal CA. Development or verification environments may use explicitly documented self-signed certificates, but that fallback must not be represented as the production trust model.

**Proposed Implementation**  
Design backend and frontend config to load certificate paths from mounted local files and document the trust assumptions in README and deployment notes. Fail clearly when TLS is enabled without required cert inputs. Keep certificate-generation utilities optional and honest rather than pretending signing/trust material is always available.

## 7. Internal carrier connector contract on the local network

**The Gap**  
The prompt requires shipment-tracking sync APIs implemented as internal connectors to on-prem carrier systems only, but it does not define their transport style, auth scheme, polling cadence, or failure recovery contract.

**The Interpretation**  
Treat carrier connectors as adapter modules that communicate only with district-approved local carrier endpoints or file-drop interfaces. Sync behavior should be job-driven, idempotent, and resumable through stored cursors and error state.

**Proposed Implementation**  
Create a connector abstraction with pluggable LAN-local REST/file adapters, signed privileged requests where required, connector health state, retry backoff, circuit-breaker state, and job-monitor integration. Persist sync cursors, last-success timestamps, failure reasons, and parcel/shipment update history for operator inspection.

## 8. Backup content boundaries and restore verification depth

**The Gap**  
The prompt requires daily full backups with 14-day retention and tested restore procedures to a separate local disk, but it does not specify whether backups must cover both MySQL data and mounted object storage, or what counts as “tested restore.”

**The Interpretation**  
Treat the required backup scope as both database state and local object-storage assets that are necessary for ticket evidence, receipts, and exported reports. Treat restore verification as a recorded administrative workflow that validates backup readability, schema compatibility, and a basic application-level restore check.

**Proposed Implementation**  
Implement scheduled backup jobs that capture MySQL dumps plus synchronized storage snapshots/metadata to a separate mounted disk path. Store backup manifests and restore-run records in the database, including verification status, operator identity, timestamp, and summary result. Document the restore workflow in README and design docs so later acceptance can verify it statically.

## 9. Excel/CSV import template governance and partial-commit policy

**The Gap**  
The prompt requires bulk import/export for master data with row-level validation and downloadable error reports, but it does not define whether valid rows should be committed when some rows fail, how template versions are managed, or how duplicate master-data rows should be reconciled.

**The Interpretation**  
Use versioned import templates and partial-commit semantics by default: valid rows are committed within a controlled transaction batch, invalid rows are rejected with row-level errors, and duplicates are handled according to explicit uniqueness rules rather than silent overwrite.

**Proposed Implementation**  
Create import-template metadata tables, row-validation result models, duplicate-detection rules per master-data entity, and downloadable correction reports that preserve source row numbers and field-level error messages. Expose import-run status in the job monitor and persist whether the run was full-success, partial-success, or failed.
