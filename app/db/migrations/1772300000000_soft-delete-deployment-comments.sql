-- Migration: Soft delete for deployment_comments
-- Deployment comments are part of the audit record (manual approvals, legacy info,
-- free-text notes, Slack links). Hard-deleting them removes the audit trail of who
-- said what and when. Switch to soft delete so historical context is retained, while
-- current-state lookups (active comments, active manual approval, active legacy info)
-- treat deleted entries as gone.

ALTER TABLE deployment_comments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

COMMENT ON COLUMN deployment_comments.deleted_at IS 'Soft-delete timestamp. NULL = active. Current-state queries (UI display, active manual approval/legacy info checks) exclude soft-deleted rows; the row itself is preserved as part of the audit trail.';
COMMENT ON COLUMN deployment_comments.deleted_by IS 'NAV-ident of the user who soft-deleted the comment.';

CREATE INDEX IF NOT EXISTS idx_deployment_comments_active
  ON deployment_comments(deployment_id)
  WHERE deleted_at IS NULL;

-- The new partial active-row index supersedes the full deployment_id index for
-- all current query paths (UI list, manual-approval/legacy-info lookups, and
-- audit-report queries all filter `deleted_at IS NULL`). Drop the older full
-- indexes to avoid double write overhead. Cascade deletes of deployments are
-- rare and can fall back to a seq scan over deployment_comments.
DROP INDEX IF EXISTS idx_comments_deployment;
DROP INDEX IF EXISTS idx_deployment_comments_deployment_id;
