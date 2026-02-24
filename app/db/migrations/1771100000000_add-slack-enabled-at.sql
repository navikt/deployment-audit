-- Track when Slack notifications were enabled, so only deployments
-- created after this timestamp get notified.
ALTER TABLE monitored_applications
ADD COLUMN IF NOT EXISTS slack_notifications_enabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS slack_deploy_notify_enabled_at TIMESTAMPTZ;

-- Backfill: set enabled_at to now() for apps that already have notifications enabled
UPDATE monitored_applications
SET slack_notifications_enabled_at = CURRENT_TIMESTAMP
WHERE slack_notifications_enabled = true AND slack_notifications_enabled_at IS NULL;

UPDATE monitored_applications
SET slack_deploy_notify_enabled_at = CURRENT_TIMESTAMP
WHERE slack_deploy_notify_enabled = true AND slack_deploy_notify_enabled_at IS NULL;
