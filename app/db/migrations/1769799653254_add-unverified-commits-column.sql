-- Add column to track commits between deployments that lack four-eyes approval
ALTER TABLE deployments
ADD COLUMN IF NOT EXISTS unverified_commits JSONB;

COMMENT ON COLUMN deployments.unverified_commits IS 'Array of commits between this deployment and previous that lack four-eyes approval';
