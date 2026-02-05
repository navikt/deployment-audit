-- Add Slack message tracking to deployments
-- Allows updating Slack notifications when deployment status changes

ALTER TABLE deployments
ADD COLUMN IF NOT EXISTS slack_message_ts TEXT,
ADD COLUMN IF NOT EXISTS slack_channel_id TEXT;

-- Index for finding deployments by Slack message
CREATE INDEX IF NOT EXISTS idx_deployments_slack_message 
ON deployments (slack_channel_id, slack_message_ts) 
WHERE slack_message_ts IS NOT NULL;

-- Add Slack configuration to monitored_applications
-- Allows per-app Slack channel configuration
ALTER TABLE monitored_applications
ADD COLUMN IF NOT EXISTS slack_channel_id TEXT,
ADD COLUMN IF NOT EXISTS slack_notifications_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN deployments.slack_message_ts IS 'Slack message timestamp for updating notifications';
COMMENT ON COLUMN deployments.slack_channel_id IS 'Slack channel where notification was sent';
COMMENT ON COLUMN monitored_applications.slack_channel_id IS 'Slack channel for this app notifications';
COMMENT ON COLUMN monitored_applications.slack_notifications_enabled IS 'Whether to send Slack notifications for this app';
