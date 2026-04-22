-- Migration: Soft delete for user_mappings
-- User mappings drive display-name resolution for historical deployments and audit
-- reports. Hard-deleting a mapping silently removes the human-readable name from
-- past deploys. Switch to soft delete so historical lookups keep returning the
-- mapping, while admin lists and current-state queries treat deleted entries as gone.

ALTER TABLE user_mappings
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

COMMENT ON COLUMN user_mappings.deleted_at IS 'Soft-delete timestamp. NULL = active. Lookups for display-name resolution still return soft-deleted rows; admin lists and current-state queries exclude them.';
COMMENT ON COLUMN user_mappings.deleted_by IS 'NAV-ident of the admin who soft-deleted the mapping.';

CREATE INDEX IF NOT EXISTS idx_user_mappings_active ON user_mappings(github_username) WHERE deleted_at IS NULL;
