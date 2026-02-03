-- Migration: Add app settings and configuration audit log
-- Purpose: Support per-app settings with audit trail for compliance

-- App settings table for storing per-application configuration
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  monitored_app_id INTEGER NOT NULL REFERENCES monitored_applications(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(monitored_app_id, setting_key)
);

-- Index for fast lookups by app
CREATE INDEX IF NOT EXISTS idx_app_settings_app_id ON app_settings(monitored_app_id);

-- Configuration audit log for tracking all setting changes
CREATE TABLE IF NOT EXISTS app_config_audit_log (
  id SERIAL PRIMARY KEY,
  monitored_app_id INTEGER NOT NULL REFERENCES monitored_applications(id) ON DELETE CASCADE,
  changed_by_nav_ident VARCHAR(20) NOT NULL,
  changed_by_name VARCHAR(255),
  setting_key VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_app_config_audit_log_app_id ON app_config_audit_log(monitored_app_id);
CREATE INDEX IF NOT EXISTS idx_app_config_audit_log_created_at ON app_config_audit_log(created_at DESC);

-- Note: 'implicitly_approved' is now a valid value for four_eyes_status column
-- The column uses VARCHAR(50) without a CHECK constraint, so no schema change needed

-- Comment for documentation
COMMENT ON TABLE app_settings IS 'Per-application configuration settings';
COMMENT ON TABLE app_config_audit_log IS 'Audit trail for all configuration changes, required for compliance';
COMMENT ON COLUMN app_config_audit_log.changed_by_nav_ident IS 'NAV-ident of user who made the change';
COMMENT ON COLUMN app_config_audit_log.change_reason IS 'Optional explanation for why the change was made';
