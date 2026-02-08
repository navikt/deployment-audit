-- Deployment status history table
-- Records all status transitions for audit trail

CREATE TABLE IF NOT EXISTS deployment_status_history (
  id SERIAL PRIMARY KEY,
  deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  from_has_four_eyes BOOLEAN,
  to_has_four_eyes BOOLEAN NOT NULL,
  changed_by VARCHAR(100),
  change_source VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_status_history_deployment
ON deployment_status_history(deployment_id);

CREATE INDEX IF NOT EXISTS idx_deployment_status_history_created
ON deployment_status_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deployment_status_history_source
ON deployment_status_history(change_source);

COMMENT ON TABLE deployment_status_history IS 'Audit trail of all deployment status transitions';
COMMENT ON COLUMN deployment_status_history.change_source IS 'Source of change: verification, manual_approval, reverification, sync, legacy, baseline_approval';
COMMENT ON COLUMN deployment_status_history.changed_by IS 'NAV-ident, GitHub username, or system identifier';
