-- Migration: Add commits table for caching commit data and PR associations
-- This enables fast verification without repeated GitHub API calls

CREATE TABLE commits (
  sha TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  author_username TEXT,
  author_date TIMESTAMPTZ,
  committer_date TIMESTAMPTZ,
  message TEXT,
  parent_shas JSONB DEFAULT '[]',
  
  -- PR association (null = direct push to main or not yet determined)
  original_pr_number INT,
  original_pr_title TEXT,
  original_pr_url TEXT,
  
  -- Cached verification result
  pr_approved BOOLEAN,
  pr_approval_reason TEXT,
  
  -- Metadata
  is_merge_commit BOOLEAN DEFAULT false,
  html_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (repo_owner, repo_name, sha)
);

-- Index for finding commits by repo
CREATE INDEX idx_commits_repo ON commits(repo_owner, repo_name);

-- Index for finding commits by date (for traversal)
CREATE INDEX idx_commits_date ON commits(repo_owner, repo_name, committer_date DESC);

-- Index for finding commits by PR
CREATE INDEX idx_commits_pr ON commits(repo_owner, repo_name, original_pr_number);

-- Index for finding unverified commits
CREATE INDEX idx_commits_unverified ON commits(repo_owner, repo_name) 
  WHERE pr_approved IS NULL OR pr_approved = false;

COMMENT ON TABLE commits IS 'Cached commit data for fast verification without GitHub API calls';
COMMENT ON COLUMN commits.original_pr_number IS 'PR number where this commit was originally authored (null = direct push)';
COMMENT ON COLUMN commits.pr_approved IS 'Cached result: was the original PR approved after this commit?';
