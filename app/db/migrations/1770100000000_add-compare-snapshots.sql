-- Migration: Add GitHub compare snapshots
-- Purpose: Cache results from GitHub's compare API (commits between two SHAs)

CREATE TABLE github_compare_snapshots (
  id SERIAL PRIMARY KEY,
  
  -- Identification
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  
  -- Versioning
  schema_version INTEGER NOT NULL DEFAULT 1,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Source and availability
  source TEXT NOT NULL DEFAULT 'github',
  github_available BOOLEAN NOT NULL DEFAULT true,
  
  -- The actual data (list of commits between base and head)
  data JSONB NOT NULL
);

-- Index for fast lookups
CREATE INDEX idx_compare_snapshots_lookup 
  ON github_compare_snapshots(owner, repo, base_sha, head_sha, schema_version, fetched_at DESC);

COMMENT ON TABLE github_compare_snapshots IS 'Cached results from GitHub compare API - commits between two SHAs';
COMMENT ON COLUMN github_compare_snapshots.base_sha IS 'Base commit SHA (exclusive - commits after this)';
COMMENT ON COLUMN github_compare_snapshots.head_sha IS 'Head commit SHA (inclusive - up to and including this)';
