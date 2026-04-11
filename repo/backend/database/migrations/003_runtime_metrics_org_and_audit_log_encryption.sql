-- Add org_id to runtime_metrics for tenant-scoped metric ingestion and summary.
ALTER TABLE runtime_metrics
  ADD COLUMN org_id VARCHAR(36) NULL AFTER collected_at,
  ADD INDEX idx_metrics_org_name_ts (org_id, metric_name, collected_at);

-- Add message_search to application_logs to support plaintext search after
-- message field is encrypted with AES-256-GCM at the application layer.
ALTER TABLE application_logs
  ADD COLUMN message_search VARCHAR(500) NULL AFTER message,
  ADD INDEX idx_logs_msg_search (message_search(191));
