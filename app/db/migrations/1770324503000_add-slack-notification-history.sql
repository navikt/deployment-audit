-- Slack notification history tables
-- Stores full history of Slack messages, updates, and interactions

-- Main notification table
CREATE TABLE IF NOT EXISTS slack_notifications (
  id SERIAL PRIMARY KEY,
  deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  
  -- Message content
  message_blocks JSONB NOT NULL,
  message_text TEXT,
  
  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  
  -- Metadata
  sent_by TEXT,  -- NAV-ident who triggered sending
  
  UNIQUE(channel_id, message_ts)
);

CREATE INDEX IF NOT EXISTS idx_slack_notifications_deployment 
ON slack_notifications(deployment_id);

CREATE INDEX IF NOT EXISTS idx_slack_notifications_sent_at 
ON slack_notifications(sent_at DESC);

-- Update log table
CREATE TABLE IF NOT EXISTS slack_notification_updates (
  id SERIAL PRIMARY KEY,
  notification_id INTEGER REFERENCES slack_notifications(id) ON DELETE CASCADE,
  action TEXT NOT NULL,  -- 'sent', 'updated', 'deleted'
  old_blocks JSONB,
  new_blocks JSONB,
  triggered_by TEXT,  -- NAV-ident or 'system'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_notification_updates_notification 
ON slack_notification_updates(notification_id);

-- Interaction log table (button clicks etc)
CREATE TABLE IF NOT EXISTS slack_interactions (
  id SERIAL PRIMARY KEY,
  notification_id INTEGER REFERENCES slack_notifications(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,  -- 'approve_deployment', 'view_details'
  slack_user_id TEXT NOT NULL,
  slack_username TEXT,
  action_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_interactions_notification 
ON slack_interactions(notification_id);

CREATE INDEX IF NOT EXISTS idx_slack_interactions_user 
ON slack_interactions(slack_user_id);

-- Comments
COMMENT ON TABLE slack_notifications IS 'Stores Slack messages sent for deployments';
COMMENT ON TABLE slack_notification_updates IS 'Audit log of message updates';
COMMENT ON TABLE slack_interactions IS 'Log of user interactions (button clicks)';
