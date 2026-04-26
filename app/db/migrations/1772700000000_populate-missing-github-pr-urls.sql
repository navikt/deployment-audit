-- Placeholder migration: do nothing.
--
-- Background:
-- An earlier version of this file (committed in 70f061a, removed in a47cdc9)
-- attempted to backfill `deployments.github_pr_url` from `github_pr_data->>'url'`,
-- but the snapshot JSONB never contained a 'url' field, so the UPDATE was a no-op.
-- That migration is registered as RAN in production's `pgmigrations` table.
--
-- node-pg-migrate's `checkOrder` requires every row in `pgmigrations` to have a
-- corresponding file in the migrations directory at the same alphabetical
-- position. Removing this file caused subsequent deploys to fail with
-- "Not run migration X is preceding already run migration ...".
--
-- This file is therefore restored as a no-op so the position aligns. The actual
-- backfill is performed by 1772800000000_backfill-github-pr-url-from-pr-number.sql.

SELECT 1;
