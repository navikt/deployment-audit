-- Migration: Add versioned GitHub data snapshots
-- Purpose: Store GitHub data with versioning, history, and granular data types

-- Granular storage of PR data with history
CREATE TABLE github_pr_snapshots (
  id SERIAL PRIMARY KEY,
  
  -- Identification
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  
  -- Versioning
  schema_version INTEGER NOT NULL DEFAULT 1,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Data type (for granular fetching)
  -- 'metadata', 'reviews', 'commits', 'comments', 'checks', 'files'
  data_type TEXT NOT NULL,
  
  -- Source and availability
  source TEXT NOT NULL DEFAULT 'github', -- 'github' | 'cached'
  github_available BOOLEAN NOT NULL DEFAULT true,
  
  -- The actual data
  data JSONB NOT NULL
);

-- Index for fast lookups - get latest snapshot for a PR/data_type
CREATE INDEX idx_pr_snapshots_lookup 
  ON github_pr_snapshots(owner, repo, pr_number, data_type, fetched_at DESC);

-- Index for finding all snapshots for a PR
CREATE INDEX idx_pr_snapshots_pr 
  ON github_pr_snapshots(owner, repo, pr_number);

-- Granular storage of commit data with history
CREATE TABLE github_commit_snapshots (
  id SERIAL PRIMARY KEY,
  
  -- Identification
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  sha TEXT NOT NULL,
  
  -- Versioning
  schema_version INTEGER NOT NULL DEFAULT 1,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Data type (for granular fetching)
  -- 'metadata', 'status', 'checks', 'prs' (associated PRs)
  data_type TEXT NOT NULL,
  
  -- Source and availability
  source TEXT NOT NULL DEFAULT 'github',
  github_available BOOLEAN NOT NULL DEFAULT true,
  
  -- The actual data
  data JSONB NOT NULL
);

-- Index for fast lookups
CREATE INDEX idx_commit_snapshots_lookup 
  ON github_commit_snapshots(owner, repo, sha, data_type, fetched_at DESC);

-- Index for finding all snapshots for a commit
CREATE INDEX idx_commit_snapshots_commit 
  ON github_commit_snapshots(owner, repo, sha);

-- Verification run history - tracks each verification with its input data
CREATE TABLE verification_runs (
  id SERIAL PRIMARY KEY,
  deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  
  -- Versioning
  schema_version INTEGER NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Input data references (snapshot IDs used for this verification)
  pr_snapshot_ids INTEGER[] NOT NULL DEFAULT '{}',
  commit_snapshot_ids INTEGER[] NOT NULL DEFAULT '{}',
  
  -- Verification result
  result JSONB NOT NULL,
  
  -- Status summary (denormalized for easy querying)
  status TEXT NOT NULL, -- 'approved', 'unverified_commits', 'pending_baseline', 'error', etc.
  has_four_eyes BOOLEAN NOT NULL
);

-- Index for finding verification runs for a deployment
CREATE INDEX idx_verification_runs_deployment 
  ON verification_runs(deployment_id, run_at DESC);

-- Index for finding latest run per deployment
CREATE INDEX idx_verification_runs_latest 
  ON verification_runs(deployment_id, schema_version, run_at DESC);

-- Comments for documentation
COMMENT ON TABLE github_pr_snapshots IS 'Versioned snapshots of GitHub PR data, stored granularly by data type';
COMMENT ON TABLE github_commit_snapshots IS 'Versioned snapshots of GitHub commit data, stored granularly by data type';
COMMENT ON TABLE verification_runs IS 'History of verification runs with references to the data snapshots used';

COMMENT ON COLUMN github_pr_snapshots.schema_version IS 'Schema version when data was fetched - used to determine if re-fetch is needed';
COMMENT ON COLUMN github_pr_snapshots.data_type IS 'Type of data: metadata, reviews, commits, comments, checks, files';
COMMENT ON COLUMN github_pr_snapshots.source IS 'Where data came from: github (fresh) or cached (from previous fetch when GitHub unavailable)';
COMMENT ON COLUMN github_pr_snapshots.github_available IS 'False if GitHub returned 404/410 (data no longer available)';
