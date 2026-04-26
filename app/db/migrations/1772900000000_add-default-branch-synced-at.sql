-- Migration: Add default_branch_synced_at to monitored_applications
-- Created: 2026-04-26
--
-- Context:
-- The verification system uses monitored_applications.default_branch to filter
-- PRs by their base branch. If this value is wrong (e.g., 'main' configured
-- when the repo actually uses 'master'), PRs are silently dropped and the
-- commits are classified as direct pushes.
--
-- This column tracks when we last synced the default_branch value from
-- GitHub's repository metadata. The periodic sync uses a cooldown to avoid
-- excessive GitHub API calls (one repos.get per app per ~24h is plenty).
--
-- NULL means "never synced yet" -- triggers an immediate sync on the next
-- periodic run, so existing rows self-correct after deploy.

ALTER TABLE monitored_applications
ADD COLUMN IF NOT EXISTS default_branch_synced_at TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN monitored_applications.default_branch_synced_at IS
  'Last time default_branch was synced from GitHub. NULL = never synced.';
