-- Deployment deviations for documenting exceptions/deviations
CREATE TABLE IF NOT EXISTS deployment_deviations (
  id SERIAL PRIMARY KEY,
  deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  registered_by VARCHAR(255) NOT NULL,
  registered_by_name VARCHAR(255),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255),
  resolved_by_name VARCHAR(255),
  resolution_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deployment_deviations_deployment_id ON deployment_deviations(deployment_id);
CREATE INDEX IF NOT EXISTS idx_deployment_deviations_created_at ON deployment_deviations(created_at);

-- Global application settings (not per-app)
CREATE TABLE IF NOT EXISTS global_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
