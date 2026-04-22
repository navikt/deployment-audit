-- Soft delete for board objectives and key results
-- Instead of physical deletion, objectives and key results are deactivated.
-- This preserves audit evidence (deployment goal links) from being destroyed.

-- Add is_active column to board_objectives
ALTER TABLE board_objectives
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add is_active column to board_key_results
ALTER TABLE board_key_results
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Change deployment_goal_links FK from ON DELETE SET NULL to ON DELETE RESTRICT
-- This prevents physical deletion of objectives/key results that have linked deployments
ALTER TABLE deployment_goal_links
  DROP CONSTRAINT IF EXISTS deployment_goal_links_objective_id_fkey;
ALTER TABLE deployment_goal_links
  ADD CONSTRAINT deployment_goal_links_objective_id_fkey
  FOREIGN KEY (objective_id) REFERENCES board_objectives(id) ON DELETE RESTRICT;

ALTER TABLE deployment_goal_links
  DROP CONSTRAINT IF EXISTS deployment_goal_links_key_result_id_fkey;
ALTER TABLE deployment_goal_links
  ADD CONSTRAINT deployment_goal_links_key_result_id_fkey
  FOREIGN KEY (key_result_id) REFERENCES board_key_results(id) ON DELETE RESTRICT;

-- Change board_objectives FK from ON DELETE CASCADE to ON DELETE RESTRICT
-- Prevents cascading deletion of objectives when a board is deleted
ALTER TABLE board_objectives
  DROP CONSTRAINT IF EXISTS board_objectives_board_id_fkey;
ALTER TABLE board_objectives
  ADD CONSTRAINT board_objectives_board_id_fkey
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE RESTRICT;

-- Change board_key_results FK from ON DELETE CASCADE to ON DELETE RESTRICT
-- Prevents cascading deletion of key results when an objective is deleted
ALTER TABLE board_key_results
  DROP CONSTRAINT IF EXISTS board_key_results_objective_id_fkey;
ALTER TABLE board_key_results
  ADD CONSTRAINT board_key_results_objective_id_fkey
  FOREIGN KEY (objective_id) REFERENCES board_objectives(id) ON DELETE RESTRICT;

-- Change external_references FKs from ON DELETE CASCADE to ON DELETE RESTRICT
ALTER TABLE external_references
  DROP CONSTRAINT IF EXISTS external_references_objective_id_fkey;
ALTER TABLE external_references
  ADD CONSTRAINT external_references_objective_id_fkey
  FOREIGN KEY (objective_id) REFERENCES board_objectives(id) ON DELETE RESTRICT;

ALTER TABLE external_references
  DROP CONSTRAINT IF EXISTS external_references_key_result_id_fkey;
ALTER TABLE external_references
  ADD CONSTRAINT external_references_key_result_id_fkey
  FOREIGN KEY (key_result_id) REFERENCES board_key_results(id) ON DELETE RESTRICT;

-- Deduplicate existing goal links before creating the unique index.
-- Keeps the oldest row (lowest id) per (deployment_id, objective_id, key_result_id) combination.
-- Logs the number of duplicate rows before deleting them.
DO $$
DECLARE
  duplicate_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM deployment_goal_links
  WHERE id NOT IN (
    SELECT MIN(id)
    FROM deployment_goal_links
    WHERE objective_id IS NOT NULL OR key_result_id IS NOT NULL
    GROUP BY deployment_id, COALESCE(objective_id, 0), COALESCE(key_result_id, 0)
  )
  AND (objective_id IS NOT NULL OR key_result_id IS NOT NULL);

  RAISE NOTICE '[soft-delete migration] Found % duplicate goal link(s) to remove', duplicate_count;

  IF duplicate_count > 0 THEN
    DELETE FROM deployment_goal_links
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM deployment_goal_links
      WHERE objective_id IS NOT NULL OR key_result_id IS NOT NULL
      GROUP BY deployment_id, COALESCE(objective_id, 0), COALESCE(key_result_id, 0)
    )
    AND (objective_id IS NOT NULL OR key_result_id IS NOT NULL);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[soft-delete migration] Deleted % duplicate goal link(s)', deleted_count;
  END IF;
END $$;

-- Soft delete for deployment goal links
-- Instead of physical deletion, links are deactivated to preserve audit evidence.
ALTER TABLE deployment_goal_links
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add unique partial index for goal link deduplication
-- Prevents duplicate (deployment, objective, key_result) combinations for active goal links.
-- Uses COALESCE to handle NULLs (since standard UNIQUE treats NULLs as distinct).
-- Partial: only applies to active rows with an objective or key result (not external URL-only links).
-- Scoped to is_active = true so re-linking after unlinking is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deployment_goal_links_unique_goal
  ON deployment_goal_links (deployment_id, COALESCE(objective_id, 0), COALESCE(key_result_id, 0))
  WHERE (objective_id IS NOT NULL OR key_result_id IS NOT NULL) AND is_active = true;
