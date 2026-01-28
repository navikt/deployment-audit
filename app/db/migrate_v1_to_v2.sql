-- Migration from V1 (repository-centric) to V2 (application-centric)
-- Run this script to migrate existing data

BEGIN;

-- Step 1: Create new tables
CREATE TABLE IF NOT EXISTS monitored_applications (
  id SERIAL PRIMARY KEY,
  team_slug VARCHAR(255) NOT NULL,
  environment_name VARCHAR(255) NOT NULL,
  app_name VARCHAR(255) NOT NULL,
  approved_github_owner VARCHAR(255) NOT NULL DEFAULT 'navikt',
  approved_github_repo_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_slug, environment_name, app_name)
);

CREATE TABLE IF NOT EXISTS repository_alerts (
  id SERIAL PRIMARY KEY,
  monitored_app_id INTEGER REFERENCES monitored_applications(id) ON DELETE CASCADE,
  deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL DEFAULT 'repository_changed',
  expected_github_owner VARCHAR(255) NOT NULL,
  expected_github_repo_name VARCHAR(255) NOT NULL,
  detected_github_owner VARCHAR(255) NOT NULL,
  detected_github_repo_name VARCHAR(255) NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255),
  resolution_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Migrate data from repositories to monitored_applications
-- We need to extract app_name from deployments since old schema didn't store it
INSERT INTO monitored_applications (
  team_slug,
  environment_name,
  app_name,
  approved_github_owner,
  approved_github_repo_name,
  created_at
)
SELECT DISTINCT
  r.nais_team_slug,
  r.nais_environment_name,
  -- Extract app name from first deployment (simplified - may need adjustment)
  SPLIT_PART(d.nais_deployment_id, '_', 1) as app_name,
  r.github_owner,
  r.github_repo_name,
  r.created_at
FROM repositories r
LEFT JOIN deployments d ON d.repo_id = r.id
WHERE d.id IS NOT NULL
ON CONFLICT (team_slug, environment_name, app_name) DO NOTHING;

-- Step 3: Add new columns to deployments table
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS monitored_app_id INTEGER;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS detected_github_owner VARCHAR(255);
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS detected_github_repo_name VARCHAR(255);
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS resources JSONB;

-- Step 4: Populate new deployment columns
UPDATE deployments d
SET 
  detected_github_owner = SPLIT_PART(d.repository, '/', 1),
  detected_github_repo_name = SPLIT_PART(d.repository, '/', 2);

-- Link deployments to monitored_applications
UPDATE deployments d
SET monitored_app_id = ma.id
FROM monitored_applications ma
WHERE ma.team_slug = d.team_slug
  AND ma.environment_name = d.environment_name
  AND ma.approved_github_owner = SPLIT_PART(d.repository, '/', 1)
  AND ma.approved_github_repo_name = SPLIT_PART(d.repository, '/', 2);

-- Step 5: Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_monitored_apps_team ON monitored_applications(team_slug);
CREATE INDEX IF NOT EXISTS idx_monitored_apps_active ON monitored_applications(is_active);
CREATE INDEX IF NOT EXISTS idx_deployments_monitored_app ON deployments(monitored_app_id);
CREATE INDEX IF NOT EXISTS idx_deployments_detected_repo ON deployments(detected_github_owner, detected_github_repo_name);
CREATE INDEX IF NOT EXISTS idx_alerts_monitored_app ON repository_alerts(monitored_app_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON repository_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON repository_alerts(created_at);

-- Step 6: Add trigger for monitored_applications.updated_at
CREATE TRIGGER update_monitored_apps_updated_at BEFORE UPDATE ON monitored_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 7: Update deployment_comments to add created_by
ALTER TABLE deployment_comments ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- Step 8: Make monitored_app_id NOT NULL after migration (but keep old columns for now)
-- Don't drop old columns yet - we'll do that in a later migration once verified

COMMIT;

-- Verification queries (run these after migration):
-- SELECT COUNT(*) FROM monitored_applications;
-- SELECT COUNT(*) FROM deployments WHERE monitored_app_id IS NULL;
-- SELECT * FROM deployments WHERE detected_github_owner IS NULL OR detected_github_repo_name IS NULL LIMIT 10;
