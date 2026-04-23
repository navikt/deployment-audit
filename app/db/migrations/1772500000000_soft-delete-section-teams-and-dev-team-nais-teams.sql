-- Migration: Soft delete for section_teams and dev_team_nais_teams
-- These two many-to-many tables encode current organisational ownership:
--   section_teams        — which Nais teams a section "owns".
--   dev_team_nais_teams  — which Nais teams a dev team is responsible for.
-- Hard-deleting an entry drops the historical record of that ownership during a
-- past period — information audit reports legitimately want to reconstruct
-- ("which dev team owned Nais-team X in Q3?"). Switch both tables to soft delete
-- so rows are preserved while current-state queries (UI listings, dashboards,
-- governance lookups, goal-keyword sync) treat deleted entries as gone.
--
-- Each table uses a composite primary key (no surrogate id), so re-adding a
-- previously soft-deleted link is handled via INSERT … ON CONFLICT DO UPDATE
-- that clears deleted_at/deleted_by on the existing row. This preserves the
-- same link record for that key and avoids accumulating multiple deleted rows
-- for the same link.

ALTER TABLE section_teams
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

COMMENT ON COLUMN section_teams.deleted_at IS 'Soft-delete timestamp. NULL = active link. Current-state queries (UI lists, dashboards, governance lookups) exclude soft-deleted rows; the row itself is preserved as part of the section-ownership audit trail.';
COMMENT ON COLUMN section_teams.deleted_by IS 'NAV-ident of the user who soft-deleted the link.';

ALTER TABLE dev_team_nais_teams
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

COMMENT ON COLUMN dev_team_nais_teams.deleted_at IS 'Soft-delete timestamp. NULL = active link. Current-state queries (UI lists, dashboards, governance lookups, goal-keyword sync) exclude soft-deleted rows; the row itself is preserved as part of the dev-team-ownership audit trail.';
COMMENT ON COLUMN dev_team_nais_teams.deleted_by IS 'NAV-ident of the user who soft-deleted the link.';

-- Partial active-row indexes supersede the existing reverse-lookup indexes for
-- all current query paths (every callsite filters deleted_at IS NULL). Keep
-- the same leading column so reverse lookups remain index-supported.
CREATE INDEX IF NOT EXISTS idx_section_teams_active
  ON section_teams(team_slug, section_id)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_section_teams_team_slug;

CREATE INDEX IF NOT EXISTS idx_dev_team_nais_teams_active
  ON dev_team_nais_teams(nais_team_slug, dev_team_id)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_dev_team_nais_teams_slug;
