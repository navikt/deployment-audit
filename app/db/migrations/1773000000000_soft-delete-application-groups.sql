-- Migration: Soft delete for application_groups
-- application_groups represent the logical grouping of monitored applications
-- that share the same code/commit across NAIS clusters or teams. They drive
-- verification-status propagation between sibling deployments and are referenced
-- (informationally) by historical UI listings and admin reports.
--
-- Hard-deleting a group erases the historical record of which applications were
-- linked together at a point in time, so audit reports cannot reconstruct
-- ("which apps formed the 'pensjon-saksoversikt' propagation cluster in Q3?").
-- Switch to soft delete so the group row is preserved while current-state
-- queries (admin UI, getAllGroups, propagation lookups) treat soft-deleted
-- groups as gone.
--
-- The monitored_applications.application_group_id FK keeps its existing
-- ON DELETE SET NULL behaviour for any future hard-delete paths, but the
-- application-level deleteGroup() also explicitly NULLs the FK on linked apps
-- as part of the soft-delete transaction. This matches the previous behaviour
-- (apps become "ungrouped") so the UI's ungroupedApps logic still works.

ALTER TABLE application_groups
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

COMMENT ON COLUMN application_groups.deleted_at IS 'Soft-delete timestamp. NULL = active group. Current-state queries (admin UI, propagation lookups) exclude soft-deleted rows; the row itself is preserved as part of the application-grouping audit trail.';
COMMENT ON COLUMN application_groups.deleted_by IS 'NAV-ident of the user who soft-deleted the group.';

-- Partial active-row index supports getAllGroups (ORDER BY name) and any
-- name-based lookup while keeping write cost low. Soft-deleted rows fall out
-- of the index, matching the WHERE deleted_at IS NULL filter on every
-- current-state query.
CREATE INDEX IF NOT EXISTS application_groups_active_name_idx
  ON application_groups (name)
  WHERE deleted_at IS NULL;
