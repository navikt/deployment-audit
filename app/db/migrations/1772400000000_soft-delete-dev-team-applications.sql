-- Migration: Soft delete for dev_team_applications
-- Direct dev-team ↔ application links represent current ownership. Hard-deleting a
-- link drops the historical record of which dev team owned an application during
-- a past period — information that audit reports legitimately want to reconstruct
-- ("which team owned app X in Q3?"). Switch to soft delete so the row is preserved
-- while current-state queries (UI listings, dashboards, governance lookups) treat
-- deleted entries as gone. Active rows can still be re-added, while current-state
-- lookups use a partial index that only includes rows where deleted_at IS NULL.
--
-- The table uses a composite primary key (dev_team_id, monitored_app_id), so
-- re-adding a previously soft-deleted link is handled via INSERT … ON CONFLICT
-- DO UPDATE that clears deleted_at/deleted_by on the existing row. This
-- preserves the same link record for that key and avoids accumulating multiple
-- deleted rows for the same link.

ALTER TABLE dev_team_applications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

COMMENT ON COLUMN dev_team_applications.deleted_at IS 'Soft-delete timestamp. NULL = active link. Current-state queries (UI lists, dashboards, governance lookups) exclude soft-deleted rows; the row itself is preserved as part of the team-ownership audit trail.';
COMMENT ON COLUMN dev_team_applications.deleted_by IS 'NAV-ident of the user who soft-deleted the link.';

-- Partial active-row index supersedes the existing reverse-lookup index for all
-- current query paths (every callsite in dev-teams.server.ts and
-- dashboard-stats.server.ts filters deleted_at IS NULL). Keep the same
-- monitored_app_id leading column for the reverse lookup.
CREATE INDEX IF NOT EXISTS idx_dev_team_applications_active
  ON dev_team_applications(monitored_app_id, dev_team_id)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_dev_team_applications_app;
