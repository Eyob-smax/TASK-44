-- Scope fulfillment idempotency to organization.
ALTER TABLE fulfillment_requests
  DROP INDEX idempotency_key,
  ADD UNIQUE KEY uq_fulfillment_org_idempotency (org_id, idempotency_key);

-- Scope generic idempotency records to principal scope.
ALTER TABLE idempotency_records
  ADD COLUMN scope VARCHAR(128) NOT NULL DEFAULT 'legacy' AFTER id,
  DROP INDEX `key`,
  ADD UNIQUE KEY uq_idempotency_scope_key (scope, `key`);
