-- Migration: Soft delete for external_references
-- External references are user-curated outgoing links from objectives/key results
-- to Jira/Slack/Confluence/etc. They are part of the goal-tracking audit trail:
-- "this objective was tied to this Jira epic from time T1 until time T2."
-- Hard-deleting a reference loses that historical association even when the
-- parent objective/KR is later deactivated. Switch to soft delete so the row is
-- preserved while current-state queries (UI lists, board renders) treat deleted
-- entries as gone.

ALTER TABLE external_references
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

COMMENT ON COLUMN external_references.deleted_at IS 'Soft-delete timestamp. NULL = active link. Current-state queries (board UI, objective/KR detail views) exclude soft-deleted rows; the row itself is preserved as part of the goal-tracking audit trail.';
COMMENT ON COLUMN external_references.deleted_by IS 'NAV-ident of the user who soft-deleted the reference.';

-- Partial active-row indexes match the current query shape: per-objective and
-- per-key-result lookups (see getBoardWithObjectives in boards.server.ts) all
-- filter deleted_at IS NULL. The indexes are partial to avoid unnecessary index
-- bloat from soft-deleted rows that are never queried in the hot path.
CREATE INDEX IF NOT EXISTS idx_external_references_active_objective
  ON external_references(objective_id)
  WHERE deleted_at IS NULL AND objective_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_references_active_key_result
  ON external_references(key_result_id)
  WHERE deleted_at IS NULL AND key_result_id IS NOT NULL;
